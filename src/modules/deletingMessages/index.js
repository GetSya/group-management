const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class DeletingMessagesModule extends BaseModule {
  constructor() {
    super('deletingMessages', 'Deleting Messages');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const del = settings.deletingMessages || { enabled: true, deleteJoin: true, deleteLeave: true, deleteCommands: true, deleteBot: false, timer: 30 };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'deleting.title', {
      status: del.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      deleteJoin: del.deleteJoin ? '✅' : '❌',
      deleteLeave: del.deleteLeave ? '✅' : '❌',
      deleteCommands: del.deleteCommands ? '✅' : '❌',
      deleteBot: del.deleteBot ? '✅' : '❌',
      timer: del.timer || 30,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'deletingMessages:toggle'),
        Markup.button.callback(this.t(lang, 'deleting.timer_btn', { timer: del.timer || 30 }), 'deletingMessages:timer'),
      ],
      [
        Markup.button.callback(`Join Msg (${del.deleteJoin ? '✅' : '❌'})`, 'deletingMessages:join'),
        Markup.button.callback(`Leave Msg (${del.deleteLeave ? '✅' : '❌'})`, 'deletingMessages:leave'),
      ],
      [
        Markup.button.callback(`Commands (${del.deleteCommands ? '✅' : '❌'})`, 'deletingMessages:commands'),
        Markup.button.callback(`Bot Msg (${del.deleteBot ? '✅' : '❌'})`, 'deletingMessages:bot'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const del = { ...settings.deletingMessages };

    if (action === 'toggle') {
      del.enabled = !del.enabled;
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Auto-deletion ${del.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'timer') {
      const timers = [10, 30, 60, 300, 600];
      const currentIndex = timers.indexOf(del.timer || 30);
      del.timer = timers[(currentIndex + 1) % timers.length];
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Timer: ${del.timer}s`);
    } else if (action === 'join') {
      del.deleteJoin = !del.deleteJoin;
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Delete Join: ${del.deleteJoin ? 'ON' : 'OFF'}`);
    } else if (action === 'leave') {
      del.deleteLeave = !del.deleteLeave;
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Delete Leave: ${del.deleteLeave ? 'ON' : 'OFF'}`);
    } else if (action === 'commands') {
      del.deleteCommands = !del.deleteCommands;
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Delete Commands: ${del.deleteCommands ? 'ON' : 'OFF'}`);
    } else if (action === 'bot') {
      del.deleteBot = !del.deleteBot;
      await this.updateSettings(chatId, del);
      await ctx.answerCbQuery(`Delete Bot msgs: ${del.deleteBot ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new DeletingMessagesModule();
