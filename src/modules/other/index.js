const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');
const customCommandRepo = require('../customCommands/customCommandRepository');

class OtherModule extends BaseModule {
  constructor() {
    super('other', 'Other Features & Settings');
  }

  async render(ctx, chatId) {
    const cid = String(chatId);
    const settings = db.getGroupSettings(cid);
    const lang = settings.language || 'en';

    let memberCount = 'N/A';
    try {
      memberCount = await ctx.telegram.getChatMembersCount(cid);
    } catch {
      // Ignored if telegram call fails
    }

    const warnings = (db.get('warnings') || []).filter(w => w.chatId === cid);
    const blocks = (db.get('blocks') || []).filter(b => b.chatId === cid);
    const customCommands = customCommandRepo.findAll(cid);

    const text = `▶️ <b>OTHER FEATURES & SETTINGS</b>\n\n📊 Group ID: <code>${cid}</code>\n👥 Members: <b>${memberCount}</b>\n📝 Custom Commands: <b>${customCommands.length}</b>\n⚠️ Active Warnings: <b>${warnings.length}</b>\n🔐 Block Rules: <b>${blocks.length}</b>\n\nSelect an option below:`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📝 Custom Commands', 'customcmd:menu'),
      ],
      [
        Markup.button.callback('📊 Statistics', 'other:stats'),
        Markup.button.callback('🔎 Logs', 'other:logs'),
      ],
      [
        Markup.button.callback('👥 Admins', 'other:admins'),
        Markup.button.callback('📋 User Management', 'other:users'),
      ],
      [
        Markup.button.callback('🔧 Advanced Settings', 'other:advanced'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const lang = settings.language || 'en';

    if (action === 'logs') {
      const logs = (db.get('logs') || [])
        .filter(l => l.chatId === chatId)
        .slice(-5)
        .reverse();

      let logText = '📋 <b>Recent Admin Logs:</b>\n\n';
      if (logs.length === 0) {
        logText += 'No recent actions recorded.';
      } else {
        logs.forEach(l => {
          logText += `• <b>${l.actionType}</b> by <code>${l.adminId}</code> (${new Date(l.createdAt).toLocaleTimeString()})\n`;
        });
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(this.t(lang, 'common.back'), 'settings:other')],
      ]);

      return this.safeEdit(ctx, logText, keyboard);
    }

    if (action === 'stats') {
      const stats = db.get('statistics', chatId) || {};
      const customStats = stats.customCommands || {};

      let statText = '📊 <b>Group Statistics & Analytics:</b>\n\n';
      const cmdEntries = Object.entries(customStats);
      if (cmdEntries.length === 0) {
        statText += 'No custom command usage recorded yet.';
      } else {
        statText += '<b>Custom Command Uses:</b>\n';
        cmdEntries.forEach(([cmd, data]) => {
          statText += `• <code>/${cmd}</code>: ${data.uses} uses (Last: ${new Date(data.lastUsedAt).toLocaleDateString()})\n`;
        });
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(this.t(lang, 'common.back'), 'settings:other')],
      ]);

      return this.safeEdit(ctx, statText, keyboard);
    }

    if (action === 'admins') {
      try {
        const admins = await ctx.telegram.getChatAdministrators(chatId);
        let adminText = `👥 <b>Group Administrators (${admins.length}):</b>\n\n`;
        admins.forEach(a => {
          const title = a.status === 'creator' ? '👑 Owner' : '🛡 Admin';
          adminText += `• ${title}: <b>${a.user.first_name || 'Admin'}</b> (<code>${a.user.id}</code>)\n`;
        });

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback(this.t(lang, 'common.back'), 'settings:other')],
        ]);

        return this.safeEdit(ctx, adminText, keyboard);
      } catch {
        // Fallback
      }
    }

    if (action === 'users') {
      const warnings = (db.get('warnings') || []).filter(w => w.chatId === chatId);
      let userText = `📋 <b>User Management Summary:</b>\n\nActive Warned Users: <b>${warnings.length}</b>\n\nUse <code>/warns @user</code> or <code>/resetwarns</code> to manage member infractions.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(this.t(lang, 'common.back'), 'settings:other')],
      ]);

      return this.safeEdit(ctx, userText, keyboard);
    }

    if (action === 'advanced') {
      let advText = `🔧 <b>Advanced Engine Settings:</b>\n\n• Database Engine: <b>db.json Local Atomic JSON</b>\n• Write Queue Status: <b>Active</b>\n• Backup System: <b>Enabled</b>\n• Framework: <b>Telegraf (Node.js LTS)</b>`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(this.t(lang, 'common.back'), 'settings:other')],
      ]);

      return this.safeEdit(ctx, advText, keyboard);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new OtherModule();
