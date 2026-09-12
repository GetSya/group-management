const customCommandRepo = require('./customCommandRepository');
const catalogRepo = require('../catalog/catalogRepository');
const { formatIDR } = require('../catalog/catalogRepository');
const { buildCustomKeyboard } = require('./customCommandKeyboard');
const { getUserMention, escapeHtml } = require('../../utils/messageUtils');
const { isAdmin } = require('../../utils/permissionUtils');
const actionService = require('../../services/actionService');
const logger = require('../../config/logger');

class CustomCommandService {
  constructor() {
    this.cooldowns = new Map(); // key: `${chatId}:${userId}:${commandName}` -> timestamp
  }

  interpolateVariables(template, ctx, parseMode = 'HTML', extra = {}) {
    if (!template) return '';

    const from = ctx.from || {};
    const chat = ctx.chat || {};
    const chatId = String(ctx.targetChatId || chat.id || '');
    const userId = String(from.id || '');
    const commandName = extra.commandName || extra.cmdName || extra.currentCommand || null;
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
      if (vars[key] !== undefined) return vars[key];

      // --- Katalog variables (pakai @, tetap dukung { } lama agar template lama tidak rusak) ---
      const k = String(key || '').toLowerCase();
      const resolveProduct = suffixOrNull => {
        const target = suffixOrNull || commandName;
        if (!target || !chatId) return null;
        try {
          return catalogRepo.findProduct(chatId, target);
        } catch {
          return null;
        }
      };

      // @price_<nama> / @harga_<nama>
      if (k.startsWith('price_') || k.startsWith('harga_')) {
        const prodName = key.slice(key.indexOf('_') + 1);
        const p = resolveProduct(prodName);
        if (!p) return 'Belum diatur';
        return formatIDR(p.price);
      }
      // @stock_<nama> / @stok_<nama> / @kuota_<nama> / @quota_<nama> / @sisa_kuota_<nama>
      if (
        k.startsWith('stock_') ||
        k.startsWith('stok_') ||
        k.startsWith('kuota_') ||
        k.startsWith('quota_') ||
        k.startsWith('sisa_kuota_') ||
        k.startsWith('sisakuota_')
      ) {
        const prodName = key.slice(key.indexOf('_') + 1);
        // sisa_kuota_<nama> -> suffix setelah prefix panjang
        const cleaned = k.startsWith('sisa_kuota_')
          ? key.slice('sisa_kuota_'.length)
          : k.startsWith('sisakuota_')
            ? key.slice('sisakuota_'.length)
            : prodName;
        const p = resolveProduct(cleaned);
        if (!p) return '0';
        const val = p.quota !== undefined && p.quota !== null ? p.quota : p.stock;
        return String(val ?? 0);
      }
      // @order_id / @orderid / @order_status
      if (k === 'order_id' || k === 'orderid') {
        try {
          const last = chatId && userId ? catalogRepo.getLastOrder(chatId, userId) : null;
          return last ? last.id : '-';
        } catch {
          return '-';
        }
      }
      if (k === 'order_status' || k === 'orderstatus') {
        try {
          const last = chatId && userId ? catalogRepo.getLastOrder(chatId, userId) : null;
          return last ? last.status : '-';
        } catch {
          return '-';
        }
      }
      // Bare @price / @harga -> produk = command saat ini (template reusable)
      if (k === 'price' || k === 'harga') {
        const p = resolveProduct(null);
        if (!p) return match;
        return formatIDR(p.price);
      }
      // Bare @stock / @stok / @kuota / @quota / @sisa_kuota -> produk saat ini
      if (k === 'stock' || k === 'stok' || k === 'kuota' || k === 'quota' || k === 'sisa_kuota' || k === 'sisakuota') {
        const p = resolveProduct(null);
        if (!p) return match;
        const val = p.quota !== undefined && p.quota !== null ? p.quota : p.stock;
        return String(val ?? 0);
      }

      return match;
    });
  }

  async checkPermission(ctx, command) {
    if (command.permission === 'everyone') return true;
    if (command.permission === 'admin') {
      return isAdmin(ctx.telegram, (ctx.targetChatId || ctx.chat.id), ctx.from.id);
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
    const chatId = String(ctx.targetChatId || ctx.chat.id);
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
    const renderedText = this.interpolateVariables(cmd.response, ctx, cmd.parseMode || 'HTML', { commandName: cmd.name });
    const keyboard = buildCustomKeyboard(cmd.buttons, 1, cmd.name);
    const parseMode = cmd.parseMode || 'HTML';

    if (isFromButton && ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    // Split long messages into chunks (Telegram limit: 4096 chars)
    const MAX_LENGTH = 4000;
    const chunks = this.splitTextIntoChunks(renderedText, MAX_LENGTH);

    let sentMsg = null;
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const extra = {
        parse_mode: parseMode,
        // Attach keyboard only to the last chunk
        ...(isLast && keyboard ? keyboard : {}),
      };
      sentMsg = await ctx.reply(chunks[i], extra);
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

  /**
   * Splits a long text into chunks not exceeding maxLength characters.
   * Tries to split on newlines to avoid cutting mid-sentence.
   */
  splitTextIntoChunks(text, maxLength = 4000) {
    if (!text || text.length <= maxLength) return [text];

    // Helper to avoid cutting surrogate pairs when hard-splitting
    const safeSlice = (str, end) => {
      let s = str.slice(0, end);
      // If we cut in the middle of a surrogate pair (high surrogate at end), drop it
      const last = s.charCodeAt(s.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        s = s.slice(0, -1);
        return { text: s, adjustedEnd: end - 1 };
      }
      return { text: s, adjustedEnd: end };
    };

    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Try to find the last newline within the limit
      let splitIndex = remaining.lastIndexOf('\n', maxLength);
      if (splitIndex <= 0) {
        // No newline found, try splitting at a space
        splitIndex = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIndex <= 0) {
        // No space found either, hard split at maxLength (surrogate-safe)
        const res = safeSlice(remaining, maxLength);
        splitIndex = res.adjustedEnd;
        chunks.push(res.text.trimEnd());
        remaining = remaining.slice(splitIndex).trimStart();
        continue;
      }
      chunks.push(remaining.slice(0, splitIndex).trimEnd());
      remaining = remaining.slice(splitIndex).trimStart();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
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
