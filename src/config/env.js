const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const env = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  DB_PATH: path.resolve(process.cwd(), process.env.DB_PATH || 'db.json'),
  BACKUP_ENABLED: process.env.BACKUP_ENABLED === 'true' || process.env.BACKUP_ENABLED === undefined,
  BACKUP_PATH: path.resolve(process.cwd(), process.env.BACKUP_PATH || 'backups'),
  // --- Database driver: 'jvault' (remote) atau 'file' (lokal db.json) ---
  DB_DRIVER: (process.env.DB_DRIVER || 'jvault').toLowerCase(),
  JVAULT_BASE_URL: process.env.JVAULT_BASE_URL || 'https://jvault.aerialstudio.tech/',
  JVAULT_API_KEY: process.env.JVAULT_API_KEY || '',
  JVAULT_BIN_ID: process.env.JVAULT_BIN_ID || '',
  JVAULT_TIMEOUT_MS: parseInt(process.env.JVAULT_TIMEOUT_MS || '15000', 10),
};

module.exports = env;
