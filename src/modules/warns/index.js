const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class WarnsModule extends BaseModule {
  constructor() {
    super('warns', 'Warnings');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const warns = settings.warns || { enabled: true, maxWarns: 3, action: 'mute', muteDuration: 86400 };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'warns.title', {
      status: warns.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      maxWarns: warns.maxWarns || 3,
      action: (warns.action || 'mute').toUpperCase(),
      muteDuration: warns.muteDuration || 86400,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'warns:toggle'),
        Markup.button.callback(`⚡ Action: ${(warns.action || 'mute').toUpperCase()}`, 'warns:action'),
      ],
      [
        Markup.button.callback(`🔢 Max Warns: ${warns.maxWarns || 3}`, 'warns:max'),
        Markup.button.callback(`⏱ Mute: ${(warns.muteDuration || 86400) / 3600}h`, 'warns:muteDuration'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const warns = { ...settings.warns };

    if (action === 'toggle') {
      warns.enabled = !warns.enabled;
      await this.updateSettings(chatId, warns);
      await ctx.answerCbQuery(`Warns ${warns.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['mute', 'kick', 'ban'];
      const currentIndex = actions.indexOf(warns.action || 'mute');
      warns.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, warns);
      await ctx.answerCbQuery(`Action: ${warns.action.toUpperCase()}`);
    } else if (action === 'max') {
      warns.maxWarns = (warns.maxWarns || 3) >= 5 ? 2 : (warns.maxWarns || 3) + 1;
      await this.updateSettings(chatId, warns);
      await ctx.answerCbQuery(`Max warns: ${warns.maxWarns}`);
    } else if (action === 'muteDuration') {
      const durations = [3600, 86400, 604800];
      const currentIndex = durations.indexOf(warns.muteDuration || 86400);
      warns.muteDuration = durations[(currentIndex + 1) % durations.length];
      await this.updateSettings(chatId, warns);
      await ctx.answerCbQuery(`Mute: ${warns.muteDuration / 3600}h`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new WarnsModule();
