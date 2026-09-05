const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class LinkModule extends BaseModule {
  constructor() {
    super('link', 'Link Protection');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const link = settings.link || { enabled: true, allowTelegramLinks: false, whitelistedDomains: ['youtube.com', 'youtu.be', 'github.com', 'google.com'], action: 'delete' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'link.title', {
      status: link.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      allowTelegramLinks: link.allowTelegramLinks ? '✅' : '❌',
      action: (link.action || 'delete').toUpperCase(),
      domains: (link.whitelistedDomains || []).join(', '),
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'link:toggle'),
        Markup.button.callback(`⚡ Action: ${(link.action || 'delete').toUpperCase()}`, 'link:action'),
      ],
      [
        Markup.button.callback(this.t(lang, 'link.toggle_tg') + ` (${link.allowTelegramLinks ? '✅' : '❌'})`, 'link:toggle_tg'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const link = { ...settings.link };

    if (action === 'toggle') {
      link.enabled = !link.enabled;
      await this.updateSettings(chatId, link);
      await ctx.answerCbQuery(`Link protection ${link.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'toggle_tg') {
      link.allowTelegramLinks = !link.allowTelegramLinks;
      await this.updateSettings(chatId, link);
      await ctx.answerCbQuery(`Telegram links: ${link.allowTelegramLinks ? 'ALLOWED' : 'BLOCKED'}`);
    } else if (action === 'action') {
      const actions = ['delete', 'warn', 'mute', 'ban'];
      const currentIndex = actions.indexOf(link.action || 'delete');
      link.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, link);
      await ctx.answerCbQuery(`Action: ${link.action.toUpperCase()}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new LinkModule();
