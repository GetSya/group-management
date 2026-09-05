const BaseModule = require('../baseModule');
const { getAntifloodKeyboard } = require('../../bot/keyboards/antifloodKeyboard');
const db = require('../../database/database');

class AntiFloodModule extends BaseModule {
  constructor() {
    super('antiflood', 'Anti-Flood');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const flood = settings.antiflood || {};
    const lang = settings.language || 'en';

    const text = this.t(lang, 'antiflood.title', {
      status: flood.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      threshold: flood.threshold || 5,
      window: flood.window || 10,
      action: (flood.action || 'mute').toUpperCase(),
    });

    const keyboard = getAntifloodKeyboard(flood, lang);
    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const flood = { ...settings.antiflood };

    if (action === 'toggle') {
      flood.enabled = !flood.enabled;
      await this.updateSettings(chatId, flood);
      await ctx.answerCbQuery(`Anti-Flood ${flood.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['mute', 'kick', 'ban', 'delete', 'warn'];
      const currentIndex = actions.indexOf(flood.action || 'mute');
      flood.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, flood);
      await ctx.answerCbQuery(`Action set to: ${flood.action.toUpperCase()}`);
    } else if (action === 'threshold') {
      flood.threshold = (flood.threshold || 5) >= 15 ? 3 : (flood.threshold || 5) + 1;
      await this.updateSettings(chatId, flood);
      await ctx.answerCbQuery(`Limit: ${flood.threshold} msgs`);
    } else if (action === 'window') {
      flood.window = (flood.window || 10) >= 30 ? 5 : (flood.window || 10) + 5;
      await this.updateSettings(chatId, flood);
      await ctx.answerCbQuery(`Window: ${flood.window}s`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new AntiFloodModule();
