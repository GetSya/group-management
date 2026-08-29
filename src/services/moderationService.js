const db = require('../database/database');
const logger = require('../config/logger');
const actionService = require('./actionService');
const { detectMediaType } = require('../utils/mediaDetector');
const { checkLinks } = require('../utils/linkDetector');
const { isScriptAllowed } = require('../utils/alphabetDetector');

class ModerationService {
  constructor() {
    // In-memory runtime trackers
    this.spamTracker = new Map(); // key: `${chatId}:${userId}` -> { text, hash, count, firstSeen }
    this.floodTracker = new Map(); // key: `${chatId}:${userId}` -> [timestamps]
    this.raidTracker = new Map(); // key: `${chatId}` -> [joinTimestamps]
    this.lockdownTracker = new Map(); // key: `${chatId}` -> expiresAt
    this.captchaSessions = new Map(); // key: `${chatId}:${userId}` -> { captchaId, expiresAt, answer }
    this.adminMentionCooldown = new Map(); // key: `${chatId}:${userId}` -> timestamp
    this.tagCooldown = new Map(); // key: `${chatId}` -> timestamp
  }

  // --- Central Moderation Pipeline ---
  async processMessage(ctx) {
    const message = ctx.message;
    if (!message || !ctx.chat) return { allowed: true };

    const chatId = String(ctx.chat.id);
    const from = ctx.from;
    if (!from) return { allowed: true };
    const userId = String(from.id);

    const groupSettings = db.getGroupSettings(chatId);
    const text = message.text || message.caption || '';

    // 1. Captcha Check (If user has pending unverified captcha)
    const captchaKey = `${chatId}:${userId}`;
    const pendingCaptcha = this.captchaSessions.get(captchaKey);
    if (pendingCaptcha && Date.now() < pendingCaptcha.expiresAt) {
      await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
      return { allowed: false, reason: 'pending_captcha' };
    }

    // 2. Block Check (User, Username, Word, Phrase, Domain)
    const blockMatch = this.checkBlocks(chatId, from, text);
    if (blockMatch.blocked) {
      await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
      await actionService.executeAction(ctx.telegram, chatId, from, blockMatch.action || 'delete', `Blocked match: ${blockMatch.value}`);
      return { allowed: false, reason: 'block_matched' };
    }

    // 3. Guardian / Anti-Raid / Lockdown Check
    if (this.isGroupLockedDown(chatId)) {
      await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
      return { allowed: false, reason: 'group_lockdown' };
    }

    // 4. Anti-Spam Check
    if (groupSettings.antispam?.enabled && text) {
      const isSpam = this.checkSpam(chatId, userId, text, groupSettings.antispam);
      if (isSpam) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        await actionService.executeAction(ctx.telegram, chatId, from, groupSettings.antispam.action || 'delete', 'Spam detected');
        return { allowed: false, reason: 'spam_detected' };
      }
    }

    // 5. Anti-Flood Check
    if (groupSettings.antiflood?.enabled) {
      const isFlood = this.checkFlood(chatId, userId, groupSettings.antiflood);
      if (isFlood) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        await actionService.executeAction(ctx.telegram, chatId, from, groupSettings.antiflood.action || 'mute', 'Flood detected');
        return { allowed: false, reason: 'flood_detected' };
      }
    }

    // 6. Night Mode Check
    if (groupSettings.night?.enabled) {
      const isNight = this.isNightTime(groupSettings.night);
      if (isNight) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        return { allowed: false, reason: 'night_mode_active' };
      }
    }

    // 7. Media Check
    const mediaType = detectMediaType(message);
    if (mediaType && groupSettings.media) {
      const isMediaAllowed = groupSettings.media[mediaType];
      if (isMediaAllowed === false) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        logger.info({ chatId, userId, mediaType }, 'Restricted media deleted');
        return { allowed: false, reason: `media_${mediaType}_restricted` };
      }
    }

    // 8. Link Protection
    if (groupSettings.link?.enabled && text) {
      const linkResult = checkLinks(
        text,
        groupSettings.link.allowTelegramLinks || false,
        groupSettings.link.whitelistedDomains || []
      );
      if (linkResult.hasLinks && !linkResult.isAllowed) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        await actionService.executeAction(ctx.telegram, chatId, from, groupSettings.link.action || 'delete', 'Disallowed link');
        return { allowed: false, reason: 'disallowed_link' };
      }
    }

    // 9. Alphabet / Script Check
    if (groupSettings.alphabets?.enabled && text) {
      const isAllowedScript = isScriptAllowed(text, groupSettings.alphabets.allowedScripts || ['LATIN']);
      if (!isAllowedScript) {
        await actionService.deleteMessage(ctx.telegram, chatId, message.message_id);
        await actionService.executeAction(ctx.telegram, chatId, from, groupSettings.alphabets.action || 'delete', 'Disallowed alphabet script');
        return { allowed: false, reason: 'disallowed_alphabet' };
      }
    }

    // 10. Auto Deleting Messages (if configured for command/bot/service messages)
    if (groupSettings.deletingMessages?.enabled) {
      this.scheduleMessageDeletion(ctx.telegram, chatId, message.message_id, groupSettings.deletingMessages);
    }

    return { allowed: true };
  }

  // --- Sub-check helper methods ---

  checkBlocks(chatId, user, text = '') {
    const blocks = db.get('blocks') || [];
    const groupBlocks = blocks.filter(b => b.chatId === String(chatId));

    const userId = String(user.id);
    const username = user.username ? user.username.toLowerCase() : '';
    const lowerText = text.toLowerCase();

    for (const b of groupBlocks) {
      const type = (b.type || '').toLowerCase();
      const val = (b.value || '').toLowerCase();

      if (type === 'user' && val === userId) {
        return { blocked: true, type, value: val, action: b.action };
      }
      if (type === 'username' && username && (val === username || val === `@${username}`)) {
        return { blocked: true, type, value: val, action: b.action };
      }
      if (type === 'word' && lowerText.includes(val)) {
        return { blocked: true, type, value: val, action: b.action };
      }
      if (type === 'phrase' && lowerText.includes(val)) {
        return { blocked: true, type, value: val, action: b.action };
      }
      if (type === 'domain' && lowerText.includes(val)) {
        return { blocked: true, type, value: val, action: b.action };
      }
    }

    return { blocked: false };
  }

  checkSpam(chatId, userId, text, config) {
    const key = `${chatId}:${userId}`;
    const now = Date.now();
    const windowMs = (config.window || 10) * 1000;
    const threshold = config.threshold || 5;

    const current = this.spamTracker.get(key);

    if (!current || now - current.firstSeen > windowMs) {
      this.spamTracker.set(key, { text, count: 1, firstSeen: now });
      return false;
    }

    if (current.text === text) {
      current.count += 1;
      if (current.count >= threshold) {
        this.spamTracker.delete(key);
        return true;
      }
    } else {
      this.spamTracker.set(key, { text, count: 1, firstSeen: now });
    }

    return false;
  }

  checkFlood(chatId, userId, config) {
    const key = `${chatId}:${userId}`;
    const now = Date.now();
    const windowMs = (config.window || 10) * 1000;
    const limit = config.threshold || 5;

    const timestamps = this.floodTracker.get(key) || [];
    const validTimestamps = timestamps.filter(ts => now - ts <= windowMs);
    validTimestamps.push(now);
    this.floodTracker.set(key, validTimestamps);

    return validTimestamps.length > limit;
  }

  isGroupLockedDown(chatId) {
    const expiresAt = this.lockdownTracker.get(String(chatId));
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.lockdownTracker.delete(String(chatId));
      return false;
    }
    return true;
  }

  activateLockdown(chatId, durationSeconds = 600) {
    this.lockdownTracker.set(String(chatId), Date.now() + durationSeconds * 1000);
    logger.warn({ chatId, durationSeconds }, 'Group lockdown activated');
  }

  isNightTime(config) {
    try {
      const now = new Date();
      // Format current time in group timezone
      const timeString = now.toLocaleTimeString('en-GB', {
        timeZone: config.timezone || 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const start = config.start || '23:00';
      const end = config.end || '06:00';

      if (start <= end) {
        return timeString >= start && timeString <= end;
      } else {
        // Crosses midnight (e.g. 23:00 to 06:00)
        return timeString >= start || timeString <= end;
      }
    } catch (err) {
      logger.error({ error: err.message }, 'Error checking night mode');
      return false;
    }
  }

  scheduleMessageDeletion(telegram, chatId, messageId, config) {
    const timerSeconds = config.timer || 30;
    if (timerSeconds <= 0) return;

    setTimeout(() => {
      actionService.deleteMessage(telegram, chatId, messageId);
    }, timerSeconds * 1000);
  }
}

module.exports = new ModerationService();
