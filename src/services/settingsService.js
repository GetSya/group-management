const db = require('../database/database');

class SettingsService {
  getGroupSettings(chatId) {
    return db.getGroupSettings(chatId);
  }

  getModuleSettings(chatId, moduleKey) {
    const groupSettings = db.getGroupSettings(chatId);
    return groupSettings[moduleKey] || {};
  }

  updateModuleSettings(chatId, moduleKey, newValues) {
    return db.updateGroupSettings(chatId, moduleKey, newValues, true);
  }
}

module.exports = new SettingsService();
