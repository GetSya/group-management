const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class PornModule extends BaseModule {
  constructor() {
    super('porn', 'Porn / NSFW');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const porn = settings.porn || { enabled: false, mode: 'disabled', action: 'delete' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'porn.title', {
      status: porn.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      mode: (porn.mode || 'disabled').toUpperCase(),
      action: (porn.action || 'delete').toUpperCase(),
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'porn.toggle_btn'), 'porn:toggle'),
        Markup.button.callback(`⚡ Action: ${(porn.action || 'delete').toUpperCase()}`, 'porn:action'),
      ],
      [
        Markup.button.callback(`Mode: ${(porn.mode || 'disabled').toUpperCase()}`, 'porn:mode'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const porn = { ...settings.porn };

    if (action === 'toggle') {
      porn.enabled = !porn.enabled;
      await this.updateSettings(chatId, porn);
      await ctx.answerCbQuery(`NSFW filter ${porn.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['delete', 'warn', 'mute', 'ban'];
      const currentIndex = actions.indexOf(porn.action || 'delete');
      porn.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, porn);
      await ctx.answerCbQuery(`Action: ${porn.action.toUpperCase()}`);
    } else if (action === 'mode') {
      porn.mode = porn.mode === 'disabled' ? 'standard' : 'disabled';
      await this.updateSettings(chatId, porn);
      await ctx.answerCbQuery(`Mode: ${porn.mode.toUpperCase()}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new PornModule();
