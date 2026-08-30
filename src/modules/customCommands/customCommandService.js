const customCommandRepo = require('./customCommandRepository');
const { buildCustomKeyboard } = require('./customCommandKeyboard');
const { getUserMention, escapeHtml } = require('../../utils/messageUtils');
const { isAdmin } = require('../../utils/permissionUtils');
const actionService = require('../../services/actionService');
const logger = require('../../config/logger');

class CustomCommandService {
  constructor() {
    this.cooldowns = new Map(); // key: `${chatId}:${userId}:${commandName}` -> timestamp
  }

  interpolateVariables(template, ctx, parseMode = 'HTML') {
    if (!template) return '';

    const from = ctx.from || {};
    const chat = ctx.chat || {};
    const now = new Date();

    const rawFirstName = from.first_name || '';
    const rawLastName = from.last_name || '';
    const rawUsername = from.username ? `@${from.username}` : (rawFirstName || 'Member');
    const rawTitle = chat.title || 'Group';

    const firstName = parseMode === 'HTML' ? escapeHtml(rawFirstName) : rawFirstName;
    const lastName = parseMode === 'HTML' ? escapeHtml(rawLastName) : rawLastName;
    const username = parseMode === 'HTML' ? escapeHtml(rawUsername) : rawUsername;
    const groupName = parseMode === 'HTML' ? escapeHtml(rawTitle) : rawTitle;
    const mention = getUserMention(from, parseMode === 'HTML');

    const fullName = [rawFirstName, rawLastName].filter(Boolean).join(' ') || firstName || username || 'User';
    const vars = {
      name: parseMode === 'HTML' ? escapeHtml(fullName) : fullName,
      user: firstName || username || 'User',
      user_id: String(from.id || ''),
      username,
      first_name: firstName,
      last_name: lastName,
      mention,
      group: groupName,
      chat_id: String(chat.id || ''),
      date: now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
      time: now.toTimeString().split(' ')[0],
    };

    return template.replace(/(?:\{(\w+)\}|@(\w+))/g, (match, braceKey, atKey) => {
      const key = braceKey || atKey;
      return vars[key] !== undefined ? vars[key] : match;
    });
  }

  async checkPermission(ctx, command) {
    if (command.permission === 'everyone') return true;
    if (command.permission === 'admin') {
      return isAdmin(ctx.telegram, ctx.chat.id, ctx.from.id);
    }
    return true;
  }

  checkCooldown(chatId, userId, command) {
    const cooldownSec = command.cooldown || 3;
    if (cooldownSec <= 0) return { inCooldown: false };

    const key = `${chatId}:${userId}:${command.name}`;
    const now = Date.now();
    const lastUsed = this.cooldowns.get(key);

    if (lastUsed && now - lastUsed < cooldownSec * 1000) {
      const remaining = Math.ceil((cooldownSec * 1000 - (now - lastUsed)) / 1000);
      return { inCooldown: true, remaining };
    }

    this.cooldowns.set(key, now);
    return { inCooldown: false };
  }

  async executeCommand(ctx, commandName, isFromButton = false) {
    const chatId = String(ctx.chat.id);
    const from = ctx.from;
    if (!from) return false;
    const userId = String(from.id);

    const cmd = customCommandRepo.findByName(chatId, commandName);
    if (!cmd || !cmd.enabled) {
      return false;
    }

    // 1. Permission check
    const hasPermission = await this.checkPermission(ctx, cmd);
    if (!hasPermission) {
      if (isFromButton) {
        await ctx.answerCbQuery('❌ You do not have permission to access this command.', { show_alert: true });
      } else {
        await ctx.reply('❌ You do not have permission to use this command.');
      }
      return true;
    }

    // 2. Cooldown check
    const cooldown = this.checkCooldown(chatId, userId, cmd);
    if (cooldown.inCooldown) {
      if (isFromButton) {
        await ctx.answerCbQuery(`⏳ Please wait ${cooldown.remaining}s before using this again.`, { show_alert: true });
      } else {
        await ctx.reply(`⏳ Please wait ${cooldown.remaining}s before using this command again.`);
      }
      return true;
    }

    // 3. Render message & keyboard
    const renderedText = this.interpolateVariables(cmd.response, ctx, cmd.parseMode || 'HTML');
    const keyboard = buildCustomKeyboard(cmd.buttons);
    const extra = {
      parse_mode: cmd.parseMode || 'HTML',
      ...(keyboard ? keyboard : {}),
    };

    let sentMsg = null;
    if (isFromButton && ctx.callbackQuery) {
      await ctx.answerCbQuery();
      // If triggered from button, reply new message to avoid overwriting previous menu unless desired
      sentMsg = await ctx.reply(renderedText, extra);
    } else {
      sentMsg = await ctx.reply(renderedText, extra);
    }

    // 4. Record Analytics
    customCommandRepo.recordUsage(chatId, cmd.name);

    // 5. Delete Trigger message if configured
    if (!isFromButton && cmd.deleteTrigger && ctx.message) {
      actionService.deleteMessage(ctx.telegram, chatId, ctx.message.message_id);
    }

    // 6. Schedule Response Deletion if configured
    if (cmd.deleteResponseAfter && cmd.deleteResponseAfter > 0 && sentMsg) {
      setTimeout(() => {
        actionService.deleteMessage(ctx.telegram, chatId, sentMsg.message_id);
      }, cmd.deleteResponseAfter * 1000);
    }

    return true;
  }

  findButtonById(chatId, buttonId) {
    const commands = customCommandRepo.findAll(chatId);
    for (const cmd of commands) {
      if (!cmd.buttons) continue;
      for (const row of cmd.buttons) {
        const btn = row.find(b => b.id === buttonId);
        if (btn) return { button: btn, command: cmd };
      }
    }
    return null;
  }
}

module.exports = new CustomCommandService();
