const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class ChecksModule extends BaseModule {
  constructor() {
    super('checks', 'Account Checks');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const chk = settings.checks || { enabled: false, blockBots: true, requireUsername: false, action: 'kick' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'checks.title', {
      status: chk.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      blockBots: chk.blockBots ? '✅' : '❌',
      requireUsername: chk.requireUsername ? '✅' : '❌',
      action: (chk.action || 'kick').toUpperCase(),
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'checks:toggle'),
        Markup.button.callback(`⚡ Action: ${(chk.action || 'kick').toUpperCase()}`, 'checks:action'),
      ],
      [
        Markup.button.callback(`${this.t(lang, 'checks.toggle_bots')} (${chk.blockBots ? '✅' : '❌'})`, 'checks:bots'),
        Markup.button.callback(`${this.t(lang, 'checks.toggle_username')} (${chk.requireUsername ? '✅' : '❌'})`, 'checks:username'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const chk = { ...settings.checks };

    if (action === 'toggle') {
      chk.enabled = !chk.enabled;
      await this.updateSettings(chatId, chk);
      await ctx.answerCbQuery(`Checks ${chk.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'bots') {
      chk.blockBots = !chk.blockBots;
      await this.updateSettings(chatId, chk);
      await ctx.answerCbQuery(`Block user bots: ${chk.blockBots ? 'ON' : 'OFF'}`);
    } else if (action === 'username') {
      chk.requireUsername = !chk.requireUsername;
      await this.updateSettings(chatId, chk);
      await ctx.answerCbQuery(`Require username: ${chk.requireUsername ? 'ON' : 'OFF'}`);
    } else if (action === 'action') {
      const actions = ['kick', 'ban', 'warn', 'mute'];
      const currentIndex = actions.indexOf(chk.action || 'kick');
      chk.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, chk);
      await ctx.answerCbQuery(`Action: ${chk.action.toUpperCase()}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new ChecksModule();
