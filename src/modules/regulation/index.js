const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const sessionService = require('../../services/sessionService');
const db = require('../../database/database');

class RegulationModule extends BaseModule {
  constructor() {
    super('regulation', 'Regulation');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const reg = settings.regulation || { enabled: false, rules: 'No rules set.' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'regulation.title', {
      status: reg.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      rules: reg.rules || 'No rules configured.',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'regulation:toggle'),
        Markup.button.callback(this.t(lang, 'regulation.edit_btn'), 'regulation:edit'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const userId = String(ctx.from.id);
    const settings = db.getGroupSettings(chatId);
    const reg = { ...settings.regulation };
    const lang = settings.language || 'en';

    if (action === 'toggle') {
      reg.enabled = !reg.enabled;
      await this.updateSettings(chatId, reg);
      await ctx.answerCbQuery(`Regulation ${reg.enabled ? 'Enabled' : 'Disabled'}`);
      return this.render(ctx, chatId);
    }

    if (action === 'edit') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'regulation', action: 'edit_rules' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(lang, 'regulation.edit_prompt'));
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new RegulationModule();
