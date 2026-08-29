const BaseModule = require('../baseModule');
const { getAntispamKeyboard } = require('../../bot/keyboards/antispamKeyboard');
const db = require('../../database/database');

class AntiSpamModule extends BaseModule {
  constructor() {
    super('antispam', 'Anti-Spam');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const spam = settings.antispam || {};
    const lang = settings.language || 'en';

    const text = this.t(lang, 'antispam.title', {
      status: spam.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      threshold: spam.threshold || 5,
      window: spam.window || 10,
      action: (spam.action || 'delete').toUpperCase(),
    });

    const keyboard = getAntispamKeyboard(spam, lang);
    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const spam = { ...settings.antispam };

    if (action === 'toggle') {
      spam.enabled = !spam.enabled;
      await this.updateSettings(chatId, spam);
      await ctx.answerCbQuery(`Anti-Spam ${spam.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['delete', 'warn', 'mute', 'kick', 'ban'];
      const currentIndex = actions.indexOf(spam.action || 'delete');
      spam.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, spam);
      await ctx.answerCbQuery(`Action set to: ${spam.action.toUpperCase()}`);
    } else if (action === 'threshold') {
      spam.threshold = (spam.threshold || 5) >= 10 ? 3 : (spam.threshold || 5) + 1;
      await this.updateSettings(chatId, spam);
      await ctx.answerCbQuery(`Threshold: ${spam.threshold}`);
    } else if (action === 'window') {
      spam.window = (spam.window || 10) >= 30 ? 5 : (spam.window || 10) + 5;
      await this.updateSettings(chatId, spam);
      await ctx.answerCbQuery(`Window: ${spam.window}s`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new AntiSpamModule();
