const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const sessionService = require('../../services/sessionService');
const db = require('../../database/database');

class WelcomeModule extends BaseModule {
  constructor() {
    super('welcome', 'Welcome Message');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const welcome = settings.welcome || {};
    const lang = settings.language || 'en';

    const text = this.t(lang, 'welcome.title', {
      status: welcome.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      deleteAfter: welcome.deleteAfter || 0,
      message: welcome.message || '👋 Welcome {mention}!',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'welcome.toggle_btn'), 'welcome:toggle'),
        Markup.button.callback(this.t(lang, 'welcome.edit_btn'), 'welcome:edit'),
      ],
      [
        Markup.button.callback(`⏱ Delete After: ${welcome.deleteAfter || 0}s`, 'welcome:timer'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const userId = String(ctx.from.id);
    const settings = db.getGroupSettings(chatId);
    const welcome = { ...settings.welcome };
    const lang = settings.language || 'en';

    if (action === 'toggle') {
      welcome.enabled = !welcome.enabled;
      await this.updateSettings(chatId, welcome);
      await ctx.answerCbQuery(`Welcome ${welcome.enabled ? 'Enabled' : 'Disabled'}`);
      return this.render(ctx, chatId);
    }

    if (action === 'edit') {
      sessionService.setSession(chatId, userId, { module: 'welcome', action: 'edit_message' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(lang, 'welcome.edit_prompt'));
    }

    if (action === 'timer') {
      const timers = [0, 30, 60, 120, 300];
      const currentIndex = timers.indexOf(welcome.deleteAfter || 0);
      welcome.deleteAfter = timers[(currentIndex + 1) % timers.length];
      await this.updateSettings(chatId, welcome);
      await ctx.answerCbQuery(`Delete timer: ${welcome.deleteAfter}s`);
      return this.render(ctx, chatId);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new WelcomeModule();
