const db = require('../database/database');

class GroupService {
  ensureGroup(chatId, title = 'Group', type = 'supergroup') {
    return db.ensureGroup(chatId, title, type);
  }

  getGroup(chatId) {
    return db.get('groups', chatId);
  }

  getAllGroups() {
    return db.get('groups') || {};
  }

  setGroupLanguage(chatId, lang) {
    const cid = String(chatId);
    const settings = db.getGroupSettings(cid);
    settings.language = lang;
    return db.set('settings', cid, settings, true);
  }
}

module.exports = new GroupService();
