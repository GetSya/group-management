const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class AdminMentionModule extends BaseModule {
  constructor() {
    super('adminMention', '@Admin Alerts');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const adm = settings.adminMention || { enabled: true, cooldown: 60, alertInGroup: true };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'adminMention.title', {
      status: adm.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      cooldown: adm.cooldown || 60,
      alertInGroup: adm.alertInGroup ? '✅' : '❌',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'adminMention:toggle'),
        Markup.button.callback(`⏱ Cooldown: ${adm.cooldown || 60}s`, 'adminMention:cooldown'),
      ],
      [
        Markup.button.callback(`Alert in Group: ${adm.alertInGroup ? '✅' : '❌'}`, 'adminMention:alertInGroup'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const adm = { ...settings.adminMention };

    if (action === 'toggle') {
      adm.enabled = !adm.enabled;
      await this.updateSettings(chatId, adm);
      await ctx.answerCbQuery(`@Admin ${adm.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'cooldown') {
      const cds = [30, 60, 120, 300];
      const currentIndex = cds.indexOf(adm.cooldown || 60);
      adm.cooldown = cds[(currentIndex + 1) % cds.length];
      await this.updateSettings(chatId, adm);
      await ctx.answerCbQuery(`Cooldown: ${adm.cooldown}s`);
    } else if (action === 'alertInGroup') {
      adm.alertInGroup = !adm.alertInGroup;
      await this.updateSettings(chatId, adm);
      await ctx.answerCbQuery(`Alert in Group: ${adm.alertInGroup ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new AdminMentionModule();
