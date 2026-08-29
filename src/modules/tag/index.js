const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class TagModule extends BaseModule {
  constructor() {
    super('tag', 'Tag Management');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const tag = settings.tag || { enabled: true, allowTagAdmins: true, cooldown: 120 };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'tag.title', {
      status: tag.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      allowTagAdmins: tag.allowTagAdmins ? '✅' : '❌',
      cooldown: tag.cooldown || 120,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'tag:toggle'),
        Markup.button.callback(`⏱ Cooldown: ${tag.cooldown || 120}s`, 'tag:cooldown'),
      ],
      [
        Markup.button.callback(`Allow /tagadmins: ${tag.allowTagAdmins ? '✅' : '❌'}`, 'tag:allowTagAdmins'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const tag = { ...settings.tag };

    if (action === 'toggle') {
      tag.enabled = !tag.enabled;
      await this.updateSettings(chatId, tag);
      await ctx.answerCbQuery(`Tag ${tag.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'cooldown') {
      const cds = [60, 120, 300, 600];
      const currentIndex = cds.indexOf(tag.cooldown || 120);
      tag.cooldown = cds[(currentIndex + 1) % cds.length];
      await this.updateSettings(chatId, tag);
      await ctx.answerCbQuery(`Cooldown: ${tag.cooldown}s`);
    } else if (action === 'allowTagAdmins') {
      tag.allowTagAdmins = !tag.allowTagAdmins;
      await this.updateSettings(chatId, tag);
      await ctx.answerCbQuery(`Tag admins: ${tag.allowTagAdmins ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new TagModule();
