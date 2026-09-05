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

    const cardStatus = goodbye.cardEnabled ? '✅ ON' : '❌ OFF';
    const bgSource = goodbye.backgroundUrl
      ? `🌐 URL`
      : goodbye.backgroundFileId
        ? `📤 ${this.t(lang, 'goodbye.bg_custom')}`
        : `🤖 ${this.t(lang, 'goodbye.bg_default')}`;

    const text =
      this.t(lang, 'goodbye.title', {
        status: goodbye.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
        deleteAfter: goodbye.deleteAfter || 60,
        message: goodbye.message || '👋 Goodbye @name!',
      }) +
      `\n\n🖼 <b>${this.t(lang, 'goodbye.card_title')}</b>: ${cardStatus}\n🎨 <b>Background</b>: ${bgSource}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'goodbye.toggle_btn'), 'goodbye:toggle'),
        Markup.button.callback(this.t(lang, 'goodbye.edit_btn'), 'goodbye:edit'),
      ],
      [
        Markup.button.callback(`⏱ Delete After: ${goodbye.deleteAfter || 60}s`, 'goodbye:timer'),
      ],
      [
        Markup.button.callback(`🖼 Card: ${goodbye.cardEnabled ? 'ON' : 'OFF'}`, 'goodbye:card_toggle'),
        Markup.button.callback(this.t(lang, 'goodbye.preview_btn'), 'goodbye:preview'),
      ],
      [
        Markup.button.callback(this.t(lang, 'goodbye.bg_btn'), 'goodbye:set_background'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
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
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'goodbye', action: 'edit_message' }, 180);
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

    if (action === 'card_toggle') {
      goodbye.cardEnabled = !goodbye.cardEnabled;
      await this.updateSettings(chatId, goodbye);
      await ctx.answerCbQuery(
        goodbye.cardEnabled ? this.t(lang, 'goodbye.card_on') : this.t(lang, 'goodbye.card_off')
      );
      return this.render(ctx, chatId);
    }

    if (action === 'set_background') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'goodbye', action: 'edit_background' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(lang, 'goodbye.bg_prompt'), { parse_mode: 'HTML' });
    }

    if (action === 'preview') {
      await ctx.answerCbQuery(this.t(lang, 'goodbye.preview_wait'));
      const cardService = require('../../services/welcomeCardService');
      const sent = await cardService.sendCardMessage(ctx.telegram, chatId, 'goodbye', {
        member: ctx.from,
        groupTitle: ctx.chat.title || 'Group',
        caption: this.t(lang, 'goodbye.preview_caption'),
        cardCfg: goodbye,
      });
      if (!sent) {
        return ctx.reply(this.t(lang, 'goodbye.preview_fail'));
      }
      return;
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new GoodbyeModule();
