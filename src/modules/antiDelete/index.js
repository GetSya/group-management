const BaseModule = require('../baseModule');
const { getAntiDeleteKeyboard } = require('../../bot/keyboards/antiDeleteKeyboard');
const db = require('../../database/database');

class AntiDeleteModule extends BaseModule {
  constructor() {
    super('antiDelete', 'Anti Delete');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const antiDelete = settings.antiDelete || { enabled: true, logDeletions: true, notifyAdmins: false, action: 'log', punishUser: false, punishThreshold: 3, punishWindow: 300, deleteBotMessages: false };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'antiDelete.title', {
      status: antiDelete.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      logDeletions: antiDelete.logDeletions ? '✅' : '❌',
      notifyAdmins: antiDelete.notifyAdmins ? '✅' : '❌',
      action: (antiDelete.action || 'log').toUpperCase(),
      punishUser: antiDelete.punishUser ? '✅' : '❌',
      punishThreshold: antiDelete.punishThreshold || 3,
      punishWindow: antiDelete.punishWindow || 300,
      deleteBotMessages: antiDelete.deleteBotMessages ? '✅' : '❌',
    });

    const keyboard = getAntiDeleteKeyboard(antiDelete, lang);
    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const antiDelete = { ...settings.antiDelete };

    if (action === 'toggle') {
      antiDelete.enabled = !antiDelete.enabled;
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Anti-Delete ${antiDelete.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'log') {
      antiDelete.logDeletions = !antiDelete.logDeletions;
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Log Deletions: ${antiDelete.logDeletions ? 'ON' : 'OFF'}`);
    } else if (action === 'notify') {
      antiDelete.notifyAdmins = !antiDelete.notifyAdmins;
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Notify Admins: ${antiDelete.notifyAdmins ? 'ON' : 'OFF'}`);
    } else if (action === 'action') {
      const actions = ['log', 'warn', 'mute', 'kick'];
      const currentIndex = actions.indexOf(antiDelete.action || 'log');
      antiDelete.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Action: ${antiDelete.action.toUpperCase()}`);
    } else if (action === 'punish') {
      antiDelete.punishUser = !antiDelete.punishUser;
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Punish User: ${antiDelete.punishUser ? 'ON' : 'OFF'}`);
    } else if (action === 'threshold') {
      const thresholds = [2, 3, 5, 10];
      const currentIndex = thresholds.indexOf(antiDelete.punishThreshold || 3);
      antiDelete.punishThreshold = thresholds[(currentIndex + 1) % thresholds.length];
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Threshold: ${antiDelete.punishThreshold}`);
    } else if (action === 'window') {
      const windows = [60, 300, 600, 1800];
      const currentIndex = windows.indexOf(antiDelete.punishWindow || 300);
      antiDelete.punishWindow = windows[(currentIndex + 1) % windows.length];
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Window: ${antiDelete.punishWindow}s`);
    } else if (action === 'botmsg') {
      antiDelete.deleteBotMessages = !antiDelete.deleteBotMessages;
      await this.updateSettings(chatId, antiDelete);
      await ctx.answerCbQuery(`Delete Bot Messages: ${antiDelete.deleteBotMessages ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new AntiDeleteModule();