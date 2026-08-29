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
};

module.exports = env;
