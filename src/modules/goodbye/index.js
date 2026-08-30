const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const sessionService = require('../../services/sessionService');
const db = require('../../database/database');

class GoodbyeModule extends BaseModule {
  constructor() {
    super('goodbye', 'Goodbye Message');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const goodbye = settings.goodbye || {};
    const lang = settings.language || 'en';

    const text = this.t(lang, 'goodbye.title', {
      status: goodbye.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      deleteAfter: goodbye.deleteAfter || 60,
      message: goodbye.message || '👋 Goodbye @name!',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'goodbye.toggle_btn'), 'goodbye:toggle'),
        Markup.button.callback(this.t(lang, 'goodbye.edit_btn'), 'goodbye:edit'),
      ],
      [
        Markup.button.callback(`⏱ Delete After: ${goodbye.deleteAfter || 60}s`, 'goodbye:timer'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from.id);
    const settings = db.getGroupSettings(chatId);
    const goodbye = { ...settings.goodbye };
    const lang = settings.language || 'en';

    if (action === 'toggle') {
      goodbye.enabled = !goodbye.enabled;
      await this.updateSettings(chatId, goodbye);
      await ctx.answerCbQuery(`Goodbye ${goodbye.enabled ? 'Enabled' : 'Disabled'}`);
      return this.render(ctx, chatId);
    }

    if (action === 'edit') {
      sessionService.setSession(chatId, userId, { module: 'goodbye', action: 'edit_message' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(lang, 'goodbye.edit_prompt'));
    }

    if (action === 'timer') {
      const timers = [0, 30, 60, 120, 300];
      const currentIndex = timers.indexOf(goodbye.deleteAfter || 60);
      goodbye.deleteAfter = timers[(currentIndex + 1) % timers.length];
      await this.updateSettings(chatId, goodbye);
      await ctx.answerCbQuery(`Delete timer: ${goodbye.deleteAfter}s`);
      return this.render(ctx, chatId);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new GoodbyeModule();
