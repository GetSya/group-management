const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class CaptchaModule extends BaseModule {
  constructor() {
    super('captcha', 'Captcha Verification');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const cap = settings.captcha || { enabled: false, type: 'button', timeout: 120, action: 'kick' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'captcha.title', {
      status: cap.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      type: (cap.type || 'button').toUpperCase(),
      timeout: cap.timeout || 120,
      action: (cap.action || 'kick').toUpperCase(),
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'captcha:toggle'),
        Markup.button.callback(`⚡ Action: ${(cap.action || 'kick').toUpperCase()}`, 'captcha:action'),
      ],
      [
        Markup.button.callback(`⏱ Timeout: ${cap.timeout || 120}s`, 'captcha:timeout'),
        Markup.button.callback(`Type: ${(cap.type || 'button').toUpperCase()}`, 'captcha:type'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const cap = { ...settings.captcha };

    if (action === 'toggle') {
      cap.enabled = !cap.enabled;
      await this.updateSettings(chatId, cap);
      await ctx.answerCbQuery(`Captcha ${cap.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['kick', 'ban', 'mute'];
      const currentIndex = actions.indexOf(cap.action || 'kick');
      cap.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, cap);
      await ctx.answerCbQuery(`Action: ${cap.action.toUpperCase()}`);
    } else if (action === 'timeout') {
      const timeouts = [60, 120, 180, 300];
      const currentIndex = timeouts.indexOf(cap.timeout || 120);
      cap.timeout = timeouts[(currentIndex + 1) % timeouts.length];
      await this.updateSettings(chatId, cap);
      await ctx.answerCbQuery(`Timeout: ${cap.timeout}s`);
    } else if (action === 'type') {
      cap.type = cap.type === 'button' ? 'math' : 'button';
      await this.updateSettings(chatId, cap);
      await ctx.answerCbQuery(`Type: ${cap.type.toUpperCase()}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new CaptchaModule();
