const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const logger = require('../config/logger');

class BackupService {
  constructor() {
    this.backupDir = env.BACKUP_PATH;
    this.enabled = env.BACKUP_ENABLED;
    this.cronJob = null;
    this.bot = null;
    this.isScheduled = false;
  }

  async init() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      logger.error({ error }, 'Failed to create backup directory');
    }
  }

  // ---------- Config helpers ----------
  _getDb() {
    // lazy to avoid circular init
    return require('./database');
  }

  getConfig() {
    const db = this._getDb();
    const cfg = db.data?.backupConfig;
    if (cfg && typeof cfg === 'object') return cfg;
    // fallback defaults
    return {
      enabled: true,
      intervalHours: 1,
      targetUsername: null,
      targetChatId: null,
      retentionCount: 20,
      lastBackupAt: null,
      nextBackupAt: null,
      autoSend: true,
    };
  }

  async saveConfig(newValues) {
    const db = this._getDb();
    if (!db.data.backupConfig) {
      const { getEmptyDatabase } = require('./schema');
      db.data.backupConfig = getEmptyDatabase().backupConfig;
    }
    Object.assign(db.data.backupConfig, newValues);
    db.data.backupConfig.updatedAt = new Date().toISOString();
    await db.queueWrite();
    return db.data.backupConfig;
  }

  // ---------- Core backup operations ----------
  async createBackup(data = null, reason = 'manual') {
    try {
      await this.init();
      const db = this._getDb();
      const sourceData = data || db.data;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `db-${timestamp}.json`;
      const filePath = path.join(this.backupDir, filename);

      await fs.writeFile(filePath, JSON.stringify(sourceData, null, 2), 'utf-8');
      logger.info({ filename, reason }, 'Database backup created successfully');

      // Update config timestamps
      const next = this._calcNextBackupTime(this.getConfig().intervalHours);
      await this.saveConfig({
        lastBackupAt: new Date().toISOString(),
        nextBackupAt: next ? next.toISOString() : null,
      });

      // Prune old backups
      await this.pruneOldBackups();

      // Auto send if enabled
      if (reason !== 'pre-restore' && this.getConfig().autoSend) {
        const cfg = this.getConfig();
        if ((cfg.targetChatId || cfg.targetUsername) && this.bot) {
          await this.sendBackupToTarget(this.bot.telegram, filePath).catch(e =>
            logger.warn({ error: e.message }, 'Failed to auto-send backup to target')
          );
        }
      }

      return { filePath, filename };
    } catch (error) {
      logger.error({ error }, 'Database backup failed');
      return null;
    }
  }

  async createManualBackup(telegram = null) {
    return this.createBackup(null, 'manual');
  }

  async listBackups() {
    try {
      await this.init();
      const files = await fs.readdir(this.backupDir);
      const jsonFiles = files.filter(f => f.startsWith('db-') && f.endsWith('.json'));
      // sort descending (newest first)
      jsonFiles.sort().reverse();
      const detailed = [];
      for (const f of jsonFiles) {
        const fp = path.join(this.backupDir, f);
        try {
          const stat = await fs.stat(fp);
          detailed.push({
            filename: f,
            path: fp,
            size: stat.size,
            sizeFormatted: this._formatBytes(stat.size),
            createdAt: stat.mtime.toISOString(),
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // skip
        }
      }
      return detailed;
    } catch (error) {
      logger.error({ error }, 'Failed to list backups');
      return [];
    }
  }

  async getBackupData(filename) {
    try {
      const safeName = path.basename(filename);
      const fp = path.join(this.backupDir, safeName);
      const content = await fs.readFile(fp, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error({ error, filename }, 'Failed to read backup file');
      return null;
    }
  }

  async getLatestBackup() {
    try {
      await this.init();
      const list = await this.listBackups();
      if (list.length === 0) return null;
      const latestPath = list[0].path;
      const content = await fs.readFile(latestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve latest backup');
      return null;
    }
  }

  async deleteBackup(filename) {
    try {
      const safeName = path.basename(filename);
      const fp = path.join(this.backupDir, safeName);
      await fs.unlink(fp);
      logger.info({ filename: safeName }, 'Backup deleted');
      return true;
    } catch (error) {
      logger.warn({ error, filename }, 'Failed to delete backup');
      return false;
    }
  }

  async pruneOldBackups(keep = null) {
    const cfg = this.getConfig();
    const retention = keep || cfg.retentionCount || 20;
    const list = await this.listBackups();
    if (list.length <= retention) return;
    const toDelete = list.slice(retention);
    for (const item of toDelete) {
      await this.deleteBackup(item.filename);
    }
    if (toDelete.length > 0) {
      logger.info({ deleted: toDelete.length, retention }, 'Old backups pruned');
    }
  }

  async restoreFromFile(filename, telegram = null) {
    const data = await this.getBackupData(filename);
    if (!data) throw new Error('Backup file not found or corrupted');
    return this.restoreFromData(data, filename);
  }

  async restoreFromData(data, sourceLabel = 'upload') {
    const { DatabaseSchema } = require('./schema');
    const db = this._getDb();

    // Guard: schema memakai .default({}) sehingga objek asing seperti
    // { bogus: true } akan lolos validasi dan me-reset DB. Tolak lebih awal.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Backup validation failed: root harus berupa objek db.json');
    }
    const knownKeys = [
      'groups',
      'users',
      'settings',
      'customCommands',
      'blocks',
      'warnings',
      'backupConfig',
    ];
    const hasKnownKey = knownKeys.some(k => Object.prototype.hasOwnProperty.call(data, k));
    if (!hasKnownKey) {
      throw new Error('Backup validation failed: format tidak dikenali (tidak ada groups/settings/users/customCommands/backupConfig)');
    }

    // Validate
    const validated = DatabaseSchema.safeParse(data);
    if (!validated.success) {
      const details = validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new Error(`Backup validation failed: ${details}`);
    }

    // Safety backup of current state before restore
    await this.createBackup(null, 'pre-restore');

    // Atomic restore
    db.data = validated.data;
    // Ensure backupConfig preserved if missing in old backup
    if (!db.data.backupConfig) {
      const { getEmptyDatabase } = require('./schema');
      db.data.backupConfig = getEmptyDatabase().backupConfig;
    }
    await db.atomicSave(db.data);
    logger.info({ source: sourceLabel }, 'Database restored from backup successfully');
    return true;
  }

  async exportCurrent() {
    const db = this._getDb();
    return JSON.parse(JSON.stringify(db.data));
  }

  // ---------- Send to username/chat ----------
  async sendBackupToTarget(telegram, filePathOrData) {
    const cfg = this.getConfig();
    const target = cfg.targetChatId || cfg.targetUsername;
    if (!target) throw new Error('Target not configured. Set username/chatId first.');
    if (!telegram) throw new Error('Telegram client not available');

    let chatId = target;
    // If target looks like @username, try resolve to chatId via getChat
    if (typeof target === 'string' && target.startsWith('@')) {
      try {
        const chat = await telegram.getChat(target);
        chatId = String(chat.id);
        // persist resolved id
        await this.saveConfig({ targetChatId: chatId });
      } catch (e) {
        // fallback to username string directly
        chatId = target;
      }
    }

    const caption = `💾 <b>Auto Backup</b> • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
      `Interval: <b>${cfg.intervalHours} jam</b>\n` +
      `File: <code>${path.basename(typeof filePathOrData === 'string' ? filePathOrData : 'db.json')}</code>`;

    if (typeof filePathOrData === 'string') {
      // send as document from file
      try {
        return await telegram.sendDocument(chatId, { source: await fs.readFile(filePathOrData), filename: path.basename(filePathOrData) }, { caption, parse_mode: 'HTML' });
      } catch (e) {
        const { describeSendError } = require('../utils/telegramErrors');
        throw new Error(describeSendError(e));
      }
    } else {
      const buf = Buffer.from(JSON.stringify(filePathOrData, null, 2), 'utf-8');
      try {
        return await telegram.sendDocument(chatId, { source: buf, filename: `db-backup-${new Date().toISOString().slice(0,10)}.json` }, { caption, parse_mode: 'HTML' });
      } catch (e) {
        const { describeSendError } = require('../utils/telegramErrors');
        throw new Error(describeSendError(e));
      }
    }
  }

  async sendLatestToTarget(telegram) {
    const list = await this.listBackups();
    if (list.length === 0) {
      // No file yet, create one and send
      const created = await this.createBackup(null, 'manual');
      if (!created) throw new Error('Failed to create backup');
      return this.sendBackupToTarget(telegram, created.filePath);
    }
    return this.sendBackupToTarget(telegram, list[0].path);
  }

  // ---------- Scheduling ----------
  _calcNextBackupTime(intervalHours) {
    const now = new Date();
    const next = new Date(now.getTime() + intervalHours * 3600 * 1000);
    return next;
  }

  _buildCronExpression(intervalHours) {
    const h = Math.max(1, Math.min(168, parseInt(intervalHours, 10) || 1));
    if (h >= 24 && 24 % h === 0) {
      // every h hours daily? fallback to hourly pattern
    }
    if (h === 1) return '0 * * * *'; // every hour at :00
    if (h < 24) return `0 */${h} * * *`; // every h hours
    // For >24, schedule daily at midnight + interval days approximation: use daily
    const days = Math.floor(h / 24);
    return `0 0 */${days} * *`;
  }

  startScheduler(bot) {
    this.bot = bot;
    const cfg = this.getConfig();

    // clear previous
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    if (!cfg.enabled) {
      logger.info('Auto backup scheduler disabled');
      return;
    }

    const cron = require('node-cron');
    const expr = this._buildCronExpression(cfg.intervalHours);

    if (!cron.validate(expr)) {
      logger.warn({ expr }, 'Invalid cron expression for auto backup, fallback to hourly');
      this.cronJob = cron.schedule('0 * * * *', () => this._runScheduledBackup());
    } else {
      this.cronJob = cron.schedule(expr, () => this._runScheduledBackup());
    }

    // update nextBackupAt
    const next = this._calcNextBackupTime(cfg.intervalHours);
    this.saveConfig({ nextBackupAt: next.toISOString() }).catch(()=>{});

    logger.info({ expr, intervalHours: cfg.intervalHours, target: cfg.targetUsername || cfg.targetChatId || 'not set' }, 'Auto backup scheduler started');
    this.isScheduled = true;
  }

  stopScheduler() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.isScheduled = false;
      logger.info('Auto backup scheduler stopped');
    }
  }

  async restartScheduler() {
    if (this.bot) {
      this.startScheduler(this.bot);
    }
  }

  async _runScheduledBackup() {
    try {
      logger.info('Running scheduled auto backup...');
      const result = await this.createBackup(null, 'auto');
      if (!result) {
        logger.warn('Scheduled backup failed: createBackup returned null');
        return;
      }
      // createBackup already auto-sends if autoSend true, but log
      logger.info({ file: result.filename }, 'Scheduled auto backup completed');
      const next = this._calcNextBackupTime(this.getConfig().intervalHours);
      await this.saveConfig({ lastBackupAt: new Date().toISOString(), nextBackupAt: next.toISOString() });
    } catch (e) {
      logger.error({ error: e.message }, 'Scheduled auto backup error');
    }
  }

  // For testing/manual trigger
  async triggerNow() {
    return this._runScheduledBackup();
  }

  // ---------- Utils ----------
  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  async getStats() {
    const list = await this.listBackups();
    const cfg = this.getConfig();
    let dbSize = 0;
    try {
      const db = this._getDb();
      dbSize = Buffer.byteLength(JSON.stringify(db.data), 'utf-8');
    } catch {}
    return {
      total: list.length,
      latest: list[0] || null,
      dbSize,
      dbSizeFormatted: this._formatBytes(dbSize),
      config: cfg,
    };
  }
}

module.exports = new BackupService();
