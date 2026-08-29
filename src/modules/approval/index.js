const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class ApprovalModule extends BaseModule {
  constructor() {
    super('approval', 'Approval Mode');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const app = settings.approval || { enabled: false, autoApprove: false, notifyAdmins: true };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'approval.title', {
      status: app.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      autoApprove: app.autoApprove ? '✅' : '❌',
      notifyAdmins: app.notifyAdmins ? '✅' : '❌',
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'regulation.toggle_btn'), 'approval:toggle'),
      ],
      [
        Markup.button.callback(`Auto Approve: ${app.autoApprove ? '✅' : '❌'}`, 'approval:auto'),
        Markup.button.callback(`Notify Admins: ${app.notifyAdmins ? '✅' : '❌'}`, 'approval:notify'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const app = { ...settings.approval };

    if (action === 'toggle') {
      app.enabled = !app.enabled;
      await this.updateSettings(chatId, app);
      await ctx.answerCbQuery(`Approval mode ${app.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'auto') {
      app.autoApprove = !app.autoApprove;
      await this.updateSettings(chatId, app);
      await ctx.answerCbQuery(`Auto approve: ${app.autoApprove ? 'ON' : 'OFF'}`);
    } else if (action === 'notify') {
      app.notifyAdmins = !app.notifyAdmins;
      await this.updateSettings(chatId, app);
      await ctx.answerCbQuery(`Notify admins: ${app.notifyAdmins ? 'ON' : 'OFF'}`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new ApprovalModule();
