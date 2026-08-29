const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class NightModule extends BaseModule {
  constructor() {
    super('night', 'Night Mode');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const night = settings.night || { enabled: false, start: '23:00', end: '06:00', timezone: 'Asia/Jakarta', action: 'delete', adminBypass: true };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'night.title', {
      status: night.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      start: night.start || '23:00',
      end: night.end || '06:00',
      timezone: night.timezone || 'Asia/Jakarta',
      action: (night.action || 'delete').toUpperCase(),
      adminBypass: night.adminBypass ? '✅' : '❌',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'night.toggle_btn'), 'night:toggle'),
        Markup.button.callback(`🕒 Hours: ${night.start}-${night.end}`, 'night:hours'),
      ],
      [
        Markup.button.callback(`Admin Bypass: ${night.adminBypass ? '✅' : '❌'}`, 'night:bypass'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const night = { ...settings.night };

    if (action === 'toggle') {
      night.enabled = !night.enabled;
      await this.updateSettings(chatId, night);
      await ctx.answerCbQuery(`Night Mode ${night.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'hours') {
      // Toggle between 23:00-06:00 and 00:00-05:00
      if (night.start === '23:00') {
        night.start = '00:00';
        night.end = '05:00';
      } else {
        night.start = '23:00';
        night.end = '06:00';
      }
      await this.updateSettings(chatId, night);
      await ctx.answerCbQuery(`Hours: ${night.start} - ${night.end}`);
    } else if (action === 'bypass') {
      night.adminBypass = !night.adminBypass;
      await this.updateSettings(chatId, night);
      await ctx.answerCbQuery(`Admin bypass: ${night.adminBypass ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new NightModule();
