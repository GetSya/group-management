const db = require('../database/database');
const i18n = require('../services/i18nService');
const telegramService = require('../services/telegramService');

class BaseModule {
  constructor(key, title) {
    this.key = key;
    this.title = title;
  }

  getSettings(chatId) {
    const groupSettings = db.getGroupSettings(chatId);
    return groupSettings[this.key] || {};
  }

  updateSettings(chatId, newValues) {
    return db.updateGroupSettings(chatId, this.key, newValues, true);
  }

  async render(ctx, chatId) {
    throw new Error(`render() method not implemented in ${this.key} module`);
  }

  async handleCallback(ctx, action, params) {
    throw new Error(`handleCallback() method not implemented in ${this.key} module`);
  }

  t(lang, keyPath, vars = {}) {
    return i18n.t(lang, keyPath, vars);
  }

  safeEdit(ctx, text, extra = {}) {
    if (!ctx.chat || !ctx.callbackQuery?.message) return;
    return telegramService.safeEditMessage(
      ctx.telegram,
      ctx.chat.id,
      ctx.callbackQuery.message.message_id,
      text,
      extra
    );
  }
}

module.exports = BaseModule;
