const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class GuardianModule extends BaseModule {
  constructor() {
    super('guardian', 'Guardian Bot');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const guard = settings.guardian || { enabled: true, threshold: 10, window: 10, duration: 600, action: 'kick' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'guardian.title', {
      status: guard.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      threshold: guard.threshold || 10,
      window: guard.window || 10,
      duration: guard.duration || 600,
      action: (guard.action || 'kick').toUpperCase(),
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'guardian:toggle'),
        Markup.button.callback(`⚡ Action: ${(guard.action || 'kick').toUpperCase()}`, 'guardian:action'),
      ],
      [
        Markup.button.callback(`🔢 Anti-Raid: ${guard.threshold} joins`, 'guardian:threshold'),
        Markup.button.callback(`⏱ Lockdown: ${guard.duration}s`, 'guardian:duration'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const guard = { ...settings.guardian };

    if (action === 'toggle') {
      guard.enabled = !guard.enabled;
      await this.updateSettings(chatId, guard);
      await ctx.answerCbQuery(`Guardian Bot ${guard.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['kick', 'ban', 'mute'];
      const currentIndex = actions.indexOf(guard.action || 'kick');
      guard.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, guard);
      await ctx.answerCbQuery(`Action: ${guard.action.toUpperCase()}`);
    } else if (action === 'threshold') {
      const limits = [5, 10, 20, 50];
      const currentIndex = limits.indexOf(guard.threshold || 10);
      guard.threshold = limits[(currentIndex + 1) % limits.length];
      await this.updateSettings(chatId, guard);
      await ctx.answerCbQuery(`Threshold: ${guard.threshold} joins`);
    } else if (action === 'duration') {
      const durs = [300, 600, 1800, 3600];
      const currentIndex = durs.indexOf(guard.duration || 600);
      guard.duration = durs[(currentIndex + 1) % durs.length];
      await this.updateSettings(chatId, guard);
      await ctx.answerCbQuery(`Lockdown: ${guard.duration}s`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new GuardianModule();
