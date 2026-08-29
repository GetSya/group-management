const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const logger = require('../config/logger');

class BackupService {
  constructor() {
    this.backupDir = env.BACKUP_PATH;
    this.enabled = env.BACKUP_ENABLED;
  }

  async init() {
    if (!this.enabled) return;
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      logger.error({ error }, 'Failed to create backup directory');
    }
  }

  async createBackup(data) {
    if (!this.enabled) return null;
    try {
      await this.init();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `db-${timestamp}.json`;
      const filePath = path.join(this.backupDir, filename);

      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug({ filename }, 'Database backup created successfully');
      return filePath;
    } catch (error) {
      logger.error({ error }, 'Database backup failed');
      return null;
    }
  }

  async getLatestBackup() {
    try {
      await this.init();
      const files = await fs.readdir(this.backupDir);
      const jsonFiles = files.filter(f => f.startsWith('db-') && f.endsWith('.json')).sort().reverse();
      if (jsonFiles.length === 0) return null;

      const latestPath = path.join(this.backupDir, jsonFiles[0]);
      const content = await fs.readFile(latestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error({ error }, 'Failed to retrieve latest backup');
      return null;
    }
  }
}

module.exports = new BackupService();
