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

    const cardStatus = welcome.cardEnabled ? '✅ ON' : '❌ OFF';
    const bgSource = welcome.backgroundUrl
      ? `🌐 URL`
      : welcome.backgroundFileId
        ? `📤 ${this.t(lang, 'welcome.bg_custom')}`
        : `🤖 ${this.t(lang, 'welcome.bg_default')}`;

    const text =
      this.t(lang, 'welcome.title', {
        status: welcome.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
        deleteAfter: welcome.deleteAfter || 0,
        message: welcome.message || '👋 Welcome @mention!',
      }) +
      `\n\n🖼 <b>${this.t(lang, 'welcome.card_title')}</b>: ${cardStatus}\n🎨 <b>Background</b>: ${bgSource}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'welcome.toggle_btn'), 'welcome:toggle'),
        Markup.button.callback(this.t(lang, 'welcome.edit_btn'), 'welcome:edit'),
      ],
      [
        Markup.button.callback(`⏱ Delete After: ${welcome.deleteAfter || 0}s`, 'welcome:timer'),
      ],
      [
        Markup.button.callback(`🖼 Card: ${welcome.cardEnabled ? 'ON' : 'OFF'}`, 'welcome:card_toggle'),
        Markup.button.callback(this.t(lang, 'welcome.preview_btn'), 'welcome:preview'),
      ],
      [
        Markup.button.callback(this.t(lang, 'welcome.bg_btn'), 'welcome:set_background'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
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
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'welcome', action: 'edit_message' }, 180);
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

    if (action === 'card_toggle') {
      welcome.cardEnabled = !welcome.cardEnabled;
      await this.updateSettings(chatId, welcome);
      await ctx.answerCbQuery(
        welcome.cardEnabled ? this.t(lang, 'welcome.card_on') : this.t(lang, 'welcome.card_off')
      );
      return this.render(ctx, chatId);
    }

    if (action === 'set_background') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'welcome', action: 'edit_background' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(lang, 'welcome.bg_prompt'), { parse_mode: 'HTML' });
    }

    if (action === 'preview') {
      await ctx.answerCbQuery(this.t(lang, 'welcome.preview_wait'));
      const cardService = require('../../services/welcomeCardService');
      const sent = await cardService.sendCardMessage(ctx.telegram, chatId, 'welcome', {
        member: ctx.from,
        groupTitle: ctx.chat.title || 'Group',
        caption: this.t(lang, 'welcome.preview_caption'),
        cardCfg: welcome,
      });
      if (!sent) {
        return ctx.reply(this.t(lang, 'welcome.preview_fail'));
      }
      return;
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new WelcomeModule();
