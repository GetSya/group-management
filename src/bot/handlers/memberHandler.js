const { Markup } = require('telegraf');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const actionService = require('../../services/actionService');
const moderationService = require('../../services/moderationService');
const { getUserMention, interpolate, getFormattedDate } = require('../../utils/messageUtils');
const cardService = require('../../services/welcomeCardService');
const logger = require('../../config/logger');

async function handleNewChatMembers(ctx) {
  const newMembers = ctx.message.new_chat_members;
  if (!newMembers || newMembers.length === 0) return;

  const chatId = String(ctx.chat.id);
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'en';

  // 1. Guardian: Anti-Raid Join Frequency Tracker
  const guard = groupSettings.guardian || { enabled: true, threshold: 10, window: 10, duration: 600, action: 'kick' };
  if (guard.enabled) {
    const now = Date.now();
    const windowMs = (guard.window || 10) * 1000;
    const joins = moderationService.raidTracker.get(chatId) || [];
    const validJoins = joins.filter(t => now - t <= windowMs);

    validJoins.push(...newMembers.map(() => now));
    moderationService.raidTracker.set(chatId, validJoins);

    if (validJoins.length >= (guard.threshold || 10)) {
      moderationService.activateLockdown(chatId, guard.duration || 600);
      try {
        await ctx.reply(i18n.t(lang, 'guardian.raid_alert', { duration: guard.duration || 600 }), { parse_mode: 'HTML' });
      } catch {
        // Ignored
      }
    }
  }

  // 2. Service Message Deletion
  if (groupSettings.deletingMessages?.enabled && groupSettings.deletingMessages.deleteJoin) {
    actionService.deleteMessage(ctx.telegram, chatId, ctx.message.message_id);
  }

  for (const member of newMembers) {
    // If bot itself was added
    if (member.id === ctx.botInfo?.id) {
      db.ensureGroup(chatId, ctx.chat.title, ctx.chat.type);
      continue;
    }

    db.ensureUser(member);

    // 3. Checks module (Block bots, require username)
    const chk = groupSettings.checks || {};
    if (chk.enabled) {
      if (chk.blockBots && member.is_bot) {
        await actionService.executeAction(ctx.telegram, chatId, member, chk.action || 'kick', 'Bot accounts prohibited');
        continue;
      }
      if (chk.requireUsername && !member.username) {
        await actionService.executeAction(ctx.telegram, chatId, member, chk.action || 'kick', 'Username required');
        continue;
      }
    }

    // 4. Captcha Verification Challenge
    const cap = groupSettings.captcha || {};
    if (cap.enabled) {
      const userId = String(member.id);
      const timeoutSec = cap.timeout || 120;

      // Restrict member until verification passed
      await actionService.restrictUser(ctx.telegram, chatId, member.id, {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_other_messages: false,
      });

      moderationService.captchaSessions.set(`${chatId}:${userId}`, {
        expiresAt: Date.now() + timeoutSec * 1000,
        member,
      });

      const mention = getUserMention(member, true);
      const promptText = i18n.t(lang, 'captcha.prompt', { mention, timeout: timeoutSec });
      const verifyKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback(i18n.t(lang, 'captcha.verify_btn'), `captcha:verify:${userId}`)],
      ]);

      try {
        const captchaMsg = await ctx.reply(promptText, { parse_mode: 'HTML', ...verifyKeyboard });

        // Set timeout callback to kick/ban user if unverified
        setTimeout(async () => {
          const session = moderationService.captchaSessions.get(`${chatId}:${userId}`);
          if (session) {
            moderationService.captchaSessions.delete(`${chatId}:${userId}`);
            await actionService.executeAction(ctx.telegram, chatId, member, cap.action || 'kick', 'Captcha timeout failed');
            await actionService.deleteMessage(ctx.telegram, chatId, captchaMsg.message_id);
          }
        }, timeoutSec * 1000);
      } catch (err) {
        logger.debug({ error: err.message }, 'Failed to deliver captcha prompt');
      }

      continue; // Skip welcome message until verified
    }

    // 5. Welcome Message
    const welcome = groupSettings.welcome || {};
    if (welcome.enabled) {
      const mention = getUserMention(member, true);
      const welcomeTemplate = welcome.message || '👋 Welcome @mention to @group!';

      const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Member';
      const welcomeText = interpolate(welcomeTemplate, {
        mention,
        name: fullName,
        user: member.first_name || 'Member',
        username: member.username ? `@${member.username}` : (member.first_name || 'Member'),
        first_name: member.first_name || '',
        last_name: member.last_name || '',
        group: ctx.chat.title || 'Group',
        date: getFormattedDate(),
      });

      try {
        let sentMsg = null;

        // Kartu gambar (opsional) — fallback otomatis ke teks bila gagal
        if (welcome.cardEnabled) {
          sentMsg = await cardService.sendCardMessage(ctx.telegram, chatId, 'welcome', {
            member,
            groupTitle: ctx.chat.title || 'Group',
            caption: welcomeText,
            cardCfg: welcome,
          });
        }
        if (!sentMsg) {
          sentMsg = await ctx.reply(welcomeText, { parse_mode: 'HTML' });
        }

        if (sentMsg && welcome.deleteAfter && welcome.deleteAfter > 0) {
          setTimeout(() => {
            actionService.deleteMessage(ctx.telegram, chatId, sentMsg.message_id);
          }, welcome.deleteAfter * 1000);
        }
      } catch (err) {
        logger.debug({ error: err.message }, 'Failed to send welcome message');
      }
    }
  }
}

async function handleLeftChatMember(ctx) {
  const leftMember = ctx.message.left_chat_member;
  if (!leftMember) return;

  const chatId = String(ctx.chat.id);
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'en';

  // 1. Service Message Deletion
  if (groupSettings.deletingMessages?.enabled && groupSettings.deletingMessages.deleteLeave) {
    actionService.deleteMessage(ctx.telegram, chatId, ctx.message.message_id);
  }

  // 2. Goodbye Message
  const goodbye = groupSettings.goodbye || {};
  if (goodbye.enabled) {
    const mention = getUserMention(leftMember, true);
    const goodbyeTemplate = goodbye.message || '👋 Goodbye @name!';

    const fullName = [leftMember.first_name, leftMember.last_name].filter(Boolean).join(' ') || 'Member';
    const goodbyeText = interpolate(goodbyeTemplate, {
      mention,
      name: fullName,
      user: leftMember.first_name || 'Member',
      username: leftMember.username ? `@${leftMember.username}` : (leftMember.first_name || 'Member'),
      first_name: leftMember.first_name || '',
      last_name: leftMember.last_name || '',
      group: ctx.chat.title || 'Group',
      date: getFormattedDate(),
    });

    try {
      let sentMsg = null;

      // Kartu gambar (opsional) — fallback otomatis ke teks bila gagal
      if (goodbye.cardEnabled) {
        sentMsg = await cardService.sendCardMessage(ctx.telegram, chatId, 'goodbye', {
          member: leftMember,
          groupTitle: ctx.chat.title || 'Group',
          caption: goodbyeText,
          cardCfg: goodbye,
        });
      }
      if (!sentMsg) {
        sentMsg = await ctx.reply(goodbyeText, { parse_mode: 'HTML' });
      }
      if (sentMsg && goodbye.deleteAfter && goodbye.deleteAfter > 0) {
        setTimeout(() => {
          actionService.deleteMessage(ctx.telegram, chatId, sentMsg.message_id);
        }, goodbye.deleteAfter * 1000);
      }
    } catch (err) {
      logger.debug({ error: err.message }, 'Failed to send goodbye message');
    }
  }
}

module.exports = {
  handleNewChatMembers,
  handleLeftChatMember,
};
