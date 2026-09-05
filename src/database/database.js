const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const logger = require('../config/logger');
const backupService = require('./backup');
const JsonVaultClient = require('./jsonVaultClient');
const { DatabaseSchema, getEmptyDatabase, getDefaultGroupSettings } = require('./schema');

const KNOWN_ROOT_KEYS = ['groups', 'users', 'settings', 'customCommands', 'blocks', 'warnings', 'backupConfig'];

class DatabaseService {
  constructor() {
    this.dbPath = env.DB_PATH;
    this.tmpPath = `${env.DB_PATH}.tmp`;
    this.data = getEmptyDatabase();
    this.isLoaded = false;
    this.writeQueue = Promise.resolve();
    this.isDirty = false;
    this.saveTimeout = null;
    // Driver diputuskan saat init() agar test bisa memaksa via process.env.
    this.driver = 'file';
    this.vault = null;
  }

  // ---------- Driver ----------

  _resolveDriver() {
    const want = String(process.env.DB_DRIVER || env.DB_DRIVER || 'file').toLowerCase();
    // Test hook: DB_PATH bisa dioverride sebelum init()
    if (process.env.DB_PATH) {
      const p = path.resolve(process.cwd(), process.env.DB_PATH);
      if (p !== this.dbPath) {
        this.dbPath = p;
        this.tmpPath = `${p}.tmp`;
      }
    }
    if (want !== 'jvault') {
      this.driver = 'file';
      this.vault = null;
      return this.driver;
    }
    const client = new JsonVaultClient({
      baseUrl: process.env.JVAULT_BASE_URL || env.JVAULT_BASE_URL,
      apiKey: process.env.JVAULT_API_KEY || env.JVAULT_API_KEY,
      binId: process.env.JVAULT_BIN_ID || env.JVAULT_BIN_ID,
      timeoutMs: parseInt(process.env.JVAULT_TIMEOUT_MS || env.JVAULT_TIMEOUT_MS || '15000', 10),
    });
    if (!client.enabled) {
      logger.warn('DB_DRIVER=jvault tetapi JVAULT_API_KEY/BIN_ID kosong. Fallback ke file lokal.');
      this.driver = 'file';
      this.vault = null;
      return this.driver;
    }
    this.driver = 'jvault';
    this.vault = client;
    return this.driver;
  }

  getDriver() {
    return this.driver;
  }

  isRemote() {
    return this.driver === 'jvault' && !!this.vault;
  }

  static hasKnownKeys(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    return KNOWN_ROOT_KEYS.some(k => Object.prototype.hasOwnProperty.call(obj, k));
  }

  // ---------- Lifecycle ----------

  async init() {
    if (this.isLoaded) return;
    this._resolveDriver();
    await this.load();
  }

  async load() {
    if (this.isRemote()) {
      await this._loadFromVault();
    } else {
      await this._loadFromFile();
    }
  }

  // ----- File driver (perilaku lama, dipertahankan) -----

  async _readLocalFile() {
    try {
      await fs.access(this.dbPath);
    } catch {
      return { exists: false };
    }
    const content = await fs.readFile(this.dbPath, 'utf-8');
    if (!content.trim()) return { exists: true, empty: true };
    return { exists: true, parsed: JSON.parse(content) };
  }

  async _loadFromFile() {
    try {
      const local = await this._readLocalFile();
      if (!local.exists || local.empty) {
        logger.info({ path: this.dbPath }, 'db.json does not exist. Initializing empty database.');
        this.data = getEmptyDatabase();
        await this.atomicSave(this.data);
        this.isLoaded = true;
        return;
      }

      const validated = DatabaseSchema.safeParse(local.parsed);
      if (!validated.success) {
        logger.warn({ errors: validated.error.errors }, 'db.json failed schema validation. Attempting repair.');
        await backupService.createBackup(local.parsed);
        this.data = { ...getEmptyDatabase(), ...local.parsed };
      } else {
        this.data = validated.data;
      }

      this.isLoaded = true;
      logger.info('Database loaded successfully into memory.');
    } catch (error) {
      logger.error({ error }, 'CRITICAL: Failed to load db.json. Attempting backup restore.');
      await this._restoreFromLocalBackup();
      this.isLoaded = true;
    }
  }

  async _restoreFromLocalBackup() {
    const restored = await backupService.getLatestBackup();
    if (restored) {
      this.data = restored;
      await this.atomicSave(this.data);
      logger.info('Database successfully restored from backup.');
    } else {
      this.data = getEmptyDatabase();
      await this.atomicSave(this.data);
      logger.warn('No valid backup found. Initialized with fresh database.');
    }
  }

  // ----- JsonVault driver (remote + mirror lokal) -----

  async _loadFromVault() {
    try {
      const remote = await this.vault.read();
      if (DatabaseService.hasKnownKeys(remote)) {
        const validated = DatabaseSchema.safeParse(remote);
        if (validated.success) {
          this.data = validated.data;
          await this._writeLocalMirror();
          this.isLoaded = true;
          logger.info('Database loaded successfully from JsonVault.');
          return;
        }
        logger.warn({ errors: validated.error.errors }, 'JsonVault data failed validation. Trying local mirror.');
      } else {
        logger.info('JsonVault bin kosong. Melakukan seeding dari mirror lokal / database kosong.');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'JsonVault GET gagal. Fallback ke mirror lokal.');
    }

    // Fallback / seed: baca mirror lokal
    try {
      const local = await this._readLocalFile();
      if (local.exists && !local.empty && DatabaseService.hasKnownKeys(local.parsed)) {
        const validated = DatabaseSchema.safeParse(local.parsed);
        this.data = validated.success ? validated.data : { ...getEmptyDatabase(), ...local.parsed };
        logger.info('Database dimuat dari mirror lokal, sinkronisasi ke JsonVault...');
        try {
          await this.vault.replace(this.data);
          logger.info('Mirror lokal berhasil di-seed ke JsonVault.');
        } catch (seedErr) {
          logger.error({ error: seedErr.message }, 'Gagal seed mirror lokal ke JsonVault (bot tetap jalan lokal)');
        }
        this.isLoaded = true;
        return;
      }
      if (local.exists && !local.empty) {
        // File lokal ada tapi bukan db yang valid -> amankan dulu
        await backupService.createBackup(local.parsed).catch(() => {});
      }
    } catch (e) {
      logger.warn({ error: e.message }, 'Gagal membaca mirror lokal');
    }

    // Terakhir: coba backup lokal, atau mulai dari kosong + seed remote
    const restored = await backupService.getLatestBackup().catch(() => null);
    this.data = restored || getEmptyDatabase();
    if (!restored) logger.warn('No valid backup found. Initialized with fresh database.');
    try {
      await this.vault.replace(this.data);
    } catch (e) {
      logger.error({ error: e.message }, 'Gagal inisialisasi bin JsonVault (bot tetap jalan dengan cache lokal)');
    }
    await this._writeLocalMirror();
    this.isLoaded = true;
  }

  async _writeLocalMirror() {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      logger.warn({ error: error.message }, 'Gagal menulis mirror lokal db.json');
    }
  }

  // ---------- Persistence ----------

  async atomicSave(dataToSave) {
    if (this.isRemote()) {
      // 1. Mirror lokal dulu (cepat + jadi fallback offline)
      await this._writeLocalMirrorAtomic(dataToSave);
      // 2. Ganti seluruh isi bin remote (PUT = 200 bila sukses)
      await this.vault.replace(dataToSave);
      return;
    }
    const dataString = JSON.stringify(dataToSave, null, 2);
    // Write to temporary file first
    await fs.writeFile(this.tmpPath, dataString, 'utf-8');
    // Rename atomically to target file
    await fs.rename(this.tmpPath, this.dbPath);
  }

  async _writeLocalMirrorAtomic(dataToSave) {
    const dataString = JSON.stringify(dataToSave, null, 2);
    try {
      await fs.writeFile(this.tmpPath, dataString, 'utf-8');
      await fs.rename(this.tmpPath, this.dbPath);
    } catch {
      // Fallback non-atomik bila rename gagal (mis. Windows EPERM sesaat)
      await this._writeLocalMirror();
    }
  }

  queueWrite() {
    this.writeQueue = this.writeQueue
      .then(async () => {
        try {
          await this.atomicSave(this.data);
          this.isDirty = false;
        } catch (error) {
          logger.error({ error }, 'Error executing queued database write');
        }
      })
      .catch(error => {
        logger.error({ error }, 'Fatal error in database write queue');
      });

    return this.writeQueue;
  }

  scheduleSave(delayMs = 200) {
    this.isDirty = true;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.queueWrite();
      this.saveTimeout = null;
    }, delayMs);
  }

  async forceSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    return this.queueWrite();
  }

  // --- CRUD API ---

  get(collection, key = null) {
    if (!this.data[collection]) return undefined;
    if (key === null) return this.data[collection];
    return this.data[collection][String(key)];
  }

  set(collection, key, value, immediate = false) {
    if (!this.data[collection]) {
      this.data[collection] = {};
    }
    this.data[collection][String(key)] = value;

    if (immediate) {
      return this.queueWrite();
    } else {
      this.scheduleSave();
      return Promise.resolve();
    }
  }

  update(collection, key, updater, immediate = false) {
    const existing = this.get(collection, key);
    const updated = typeof updater === 'function' ? updater(existing) : { ...existing, ...updater };
    return this.set(collection, key, updated, immediate);
  }

  delete(collection, key, immediate = false) {
    if (this.data[collection] && this.data[collection][String(key)] !== undefined) {
      delete this.data[collection][String(key)];
      if (immediate) {
        return this.queueWrite();
      } else {
        this.scheduleSave();
      }
    }
    return Promise.resolve();
  }

  push(collection, item, immediate = false) {
    if (!Array.isArray(this.data[collection])) {
      this.data[collection] = [];
    }
    this.data[collection].push(item);

    if (immediate) {
      return this.queueWrite();
    } else {
      this.scheduleSave();
      return Promise.resolve();
    }
  }

  find(collection, predicate) {
    if (Array.isArray(this.data[collection])) {
      return this.data[collection].find(predicate);
    }
    return Object.values(this.data[collection] || {}).find(predicate);
  }

  findOne(collection, predicate) {
    return this.find(collection, predicate);
  }

  findMany(collection, predicate = () => true) {
    if (Array.isArray(this.data[collection])) {
      return this.data[collection].filter(predicate);
    }
    return Object.values(this.data[collection] || {}).filter(predicate);
  }

  // --- Group Specific Management ---

  getGroupSettings(chatId) {
    const cid = String(chatId);
    if (!this.data.settings[cid]) {
      const defaults = getDefaultGroupSettings(cid);
      this.data.settings[cid] = defaults;
      this.scheduleSave();
    }
    return this.data.settings[cid];
  }

  updateGroupSettings(chatId, moduleKey, newValues, immediate = true) {
    const cid = String(chatId);
    const current = this.getGroupSettings(cid);

    if (moduleKey) {
      current[moduleKey] = {
        ...current[moduleKey],
        ...newValues,
      };
    } else {
      Object.assign(current, newValues);
    }

    current.updatedAt = new Date().toISOString();
    return this.set('settings', cid, current, immediate);
  }

  ensureGroup(chatId, title = 'Group', type = 'supergroup') {
    const cid = String(chatId);
    if (!this.data.groups[cid]) {
      this.data.groups[cid] = {
        id: cid,
        chatId: cid,
        title,
        type,
        isActive: true,
        joinedAt: new Date().toISOString(),
      };
      this.getGroupSettings(cid); // initializes default settings if absent
      this.queueWrite();
      logger.info({ chatId: cid, title }, 'Registered new group in database');
    }
    return this.data.groups[cid];
  }

  ensureUser(telegramUser) {
    if (!telegramUser || !telegramUser.id) return null;
    const uid = String(telegramUser.id);
    this.data.users[uid] = {
      id: uid,
      telegramId: uid,
      username: telegramUser.username || null,
      firstName: telegramUser.first_name || '',
      lastName: telegramUser.last_name || null,
      updatedAt: new Date().toISOString(),
    };
    this.scheduleSave(1000);
    return this.data.users[uid];
  }
}

module.exports = new DatabaseService();
