const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const logger = require('../config/logger');
const backupService = require('./backup');
const { DatabaseSchema, getEmptyDatabase, getDefaultGroupSettings } = require('./schema');

class DatabaseService {
  constructor() {
    this.dbPath = env.DB_PATH;
    this.tmpPath = `${env.DB_PATH}.tmp`;
    this.data = getEmptyDatabase();
    this.isLoaded = false;
    this.writeQueue = Promise.resolve();
    this.isDirty = false;
    this.saveTimeout = null;
  }

  async init() {
    if (this.isLoaded) return;
    await this.load();
  }

  async load() {
    try {
      // Check if file exists
      try {
        await fs.access(this.dbPath);
      } catch {
        logger.info({ path: this.dbPath }, 'db.json does not exist. Initializing empty database.');
        this.data = getEmptyDatabase();
        await this.atomicSave(this.data);
        this.isLoaded = true;
        return;
      }

      const content = await fs.readFile(this.dbPath, 'utf-8');
      if (!content.trim()) {
        this.data = getEmptyDatabase();
        await this.atomicSave(this.data);
        this.isLoaded = true;
        return;
      }

      const parsed = JSON.parse(content);
      const validated = DatabaseSchema.safeParse(parsed);

      if (!validated.success) {
        logger.warn({ errors: validated.error.errors }, 'db.json failed schema validation. Attempting repair.');
        // Create backup of corrupted file
        await backupService.createBackup(parsed);
        this.data = { ...getEmptyDatabase(), ...parsed };
      } else {
        this.data = validated.data;
      }

      this.isLoaded = true;
      logger.info('Database loaded successfully into memory.');
    } catch (error) {
      logger.error({ error }, 'CRITICAL: Failed to load db.json. Attempting backup restore.');
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
      this.isLoaded = true;
    }
  }

  async atomicSave(dataToSave) {
    const dataString = JSON.stringify(dataToSave, null, 2);
    // Write to temporary file first
    await fs.writeFile(this.tmpPath, dataString, 'utf-8');
    // Rename atomically to target file
    await fs.rename(this.tmpPath, this.dbPath);
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
