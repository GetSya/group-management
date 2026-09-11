const { Markup } = require('telegraf');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const actionService = require('../../services/actionService');
const moderationService = require('../../services/moderationService');
const { getUserMention, interpolate, getFormattedDate, escapeHtml } = require('../../utils/messageUtils');
const cardService = require('../../services/welcomeCardService');
const logger = require('../../config/logger');

/**
 * Bangun teks welcome/goodbye dengan aman untuk parse_mode HTML.
 * `mention` sengaja HTML (<a href>), semua variabel lain di-escape
 * agar nama user / judul grup dengan karakter &, <, > tidak membuat
 * Telegram menolak pesan ("can't parse entities") di sebagian grup saja.
 */
function buildGreetingText(template, member, groupTitle) {
  const mention = getUserMention(member, true);
  const fullName = escapeHtml([member.first_name, member.last_name].filter(Boolean).join(' ') || 'Member');
  const firstName = escapeHtml(member.first_name || 'Member');
  const lastName = escapeHtml(member.last_name || '');
  const username = member.username ? `@${escapeHtml(member.username)}` : firstName;
  const safeGroup = escapeHtml(groupTitle || 'Group');
  const date = escapeHtml(getFormattedDate());
  return interpolate(template, {
    mention,
    name: fullName,
    user: firstName,
    username,
    first_name: firstName,
    last_name: lastName,
    group: safeGroup,
    date,
  });
}

/** Kirim teks: coba HTML dulu, fallback teks polos bila template admin rusak. */
async function sendHtmlWithPlainFallback(sendFn, text) {
  try {
    return await sendFn(text, { parse_mode: 'HTML' });
  } catch (err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes("can't parse entities") || msg.includes('wrong html') || msg.includes("can't parse")) {
      logger.debug({ error: err.message }, 'Greeting HTML ditolak, fallback teks polos');
      return sendFn(String(text || '').replace(/<[^>]*>/g, ''));
    }
    throw err;
  }
}

function sendTextMessage(telegram, chatId, text) {
  return sendHtmlWithPlainFallback((t, extra) => telegram.sendMessage(chatId, t, extra || {}), text);
}

/**
 * Hasil pengiriman sambutan/perpisahan terakhir per grup (in-memory).
 * Dipakai command /cekwelcome agar admin bisa melihat kenapa satu grup
 * diam sementara grup lain normal — tanpa harus membaca log server.
 */
const lastGreetingResult = new Map(); // chatId -> { at, type, ok, method, error }

function recordGreetingResult(chatId, info) {
  try {
    lastGreetingResult.set(String(chatId), { at: new Date().toISOString(), ...info });
    if (lastGreetingResult.size > 200) {
      const oldest = lastGreetingResult.keys().next().value;
      lastGreetingResult.delete(oldest);
    }
  } catch {
    // diagnostik tidak boleh mengganggu alur utama
  }
}

function getLastGreetingResult(chatId) {
  return lastGreetingResult.get(String(chatId)) || null;
}

/**
 * Dedup pengiriman sapaan: di grup normal, satu join memicu DUA update
 * (service message new_chat_members + chat_member). Tanpa ini welcome
 * terkirim dobel. Key per arah (join/leave) dengan TTL 120 detik.
 */
const greetingDedup = new Map(); // key -> timestamp ms
const GREETING_DEDUP_TTL_MS = 120 * 1000;

function shouldDeliverGreeting(type, chatId, userId) {
  const key = `${type}:${String(chatId)}:${String(userId)}`;
  const now = Date.now();
  const last = greetingDedup.get(key);
  if (last && now - last < GREETING_DEDUP_TTL_MS) return false;
  greetingDedup.set(key, now);
  if (greetingDedup.size > 1000) {
    for (const [k, ts] of greetingDedup) {
      if (now - ts >= GREETING_DEDUP_TTL_MS) greetingDedup.delete(k);
      if (greetingDedup.size <= 800) break;
    }
  }
  return true;
}

/**
 * Inti pengiriman welcome — dipakai jalur service message maupun
 * fallback chat_member (grup Hidden Members). Return { delivered, ... }.
 */
async function deliverWelcome(telegram, chatId, chatTitle, member) {
  const cid = String(chatId);
  const groupSettings = db.getGroupSettings(cid);
  const welcome = groupSettings.welcome || {};
  if (!welcome.enabled) return { delivered: false, reason: 'disabled' };
  if (!shouldDeliverGreeting('welcome', cid, member.id)) {
    return { delivered: false, reason: 'duplicate' };
  }

  const welcomeTemplate = welcome.message || '👋 Welcome @mention to @group!';
  const welcomeText = buildGreetingText(welcomeTemplate, member, chatTitle);

  try {
    let sentMsg = null;
    let method = 'text';

    if (welcome.cardEnabled) {
      sentMsg = await cardService.sendCardMessage(telegram, cid, 'welcome', {
        member,
        groupTitle: chatTitle || 'Group',
        caption: welcomeText,
        cardCfg: welcome,
      });
      if (sentMsg) method = 'card';
    }
    if (!sentMsg) {
      sentMsg = await sendTextMessage(telegram, cid, welcomeText);
    }

    recordGreetingResult(cid, { type: 'welcome', ok: true, method });

    if (sentMsg && welcome.deleteAfter && welcome.deleteAfter > 0) {
      setTimeout(() => {
        actionService.deleteMessage(telegram, cid, sentMsg.message_id);
      }, welcome.deleteAfter * 1000);
    }
    return { delivered: true, method };
  } catch (err) {
    logger.warn({ chatId: cid, error: err.message }, 'Failed to send welcome message');
    recordGreetingResult(cid, { type: 'welcome', ok: false, method: 'none', error: err.message });
    return { delivered: false, reason: 'error', error: err.message };
  }
}

async function deliverGoodbye(telegram, chatId, chatTitle, member) {
  const cid = String(chatId);
  const groupSettings = db.getGroupSettings(cid);
  const goodbye = groupSettings.goodbye || {};
  if (!goodbye.enabled) return { delivered: false, reason: 'disabled' };
  if (!shouldDeliverGreeting('goodbye', cid, member.id)) {
    return { delivered: false, reason: 'duplicate' };
  }

  const goodbyeTemplate = goodbye.message || '👋 Goodbye @name!';
  const goodbyeText = buildGreetingText(goodbyeTemplate, member, chatTitle);

  try {
    let sentMsg = null;
    let method = 'text';

    if (goodbye.cardEnabled) {
      sentMsg = await cardService.sendCardMessage(telegram, cid, 'goodbye', {
        member,
        groupTitle: chatTitle || 'Group',
        caption: goodbyeText,
        cardCfg: goodbye,
      });
      if (sentMsg) method = 'card';
    }
    if (!sentMsg) {
      sentMsg = await sendTextMessage(telegram, cid, goodbyeText);
    }

    recordGreetingResult(cid, { type: 'goodbye', ok: true, method });

    if (sentMsg && goodbye.deleteAfter && goodbye.deleteAfter > 0) {
      setTimeout(() => {
        actionService.deleteMessage(telegram, cid, sentMsg.message_id);
      }, goodbye.deleteAfter * 1000);
    }
    return { delivered: true, method };
  } catch (err) {
    logger.warn({ chatId: cid, error: err.message }, 'Failed to send goodbye message');
    recordGreetingResult(cid, { type: 'goodbye', ok: false, method: 'none', error: err.message });
    return { delivered: false, reason: 'error', error: err.message };
  }
}

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

    // 5. Welcome Message (inti di deliverWelcome — dipakai juga oleh fallback chat_member)
    await deliverWelcome(ctx.telegram, chatId, ctx.chat.title, member);
  }
}

/**
 * Klasifikasi perubahan status member (update chat_member) menjadi
 * join / leave / null (perubahan lain: promote, restrict, dll).
 */
function classifyChatMemberUpdate(oldStatus, newStatus) {
  const inChat = s => s === 'member' || s === 'administrator' || s === 'creator' || s === 'restricted';
  const wasIn = inChat(oldStatus);
  const nowIn = inChat(newStatus);
  if (!wasIn && nowIn) return 'join';
  if (wasIn && !nowIn) return 'leave';
  return null;
}

/**
 * Fallback untuk grup dengan Hidden Members (has_hidden_members): Telegram
 * TIDAK mengirim service message new_chat_members/left_chat_member, jadi
 * welcome & goodbye tidak pernah jalan. Jalur ini memakai update
 * chat_member (sudah termasuk di allowedUpdates app.js; bot harus admin).
 *
 * Catatan: modul captcha & checks hanya berjalan di jalur service message,
 * jadi di grup hidden-members user baru langsung dapat welcome tanpa
 * verifikasi/kick-otomatis. Dedup 120 detik mencegah kiriman ganda di
 * grup normal yang menerima kedua update.
 */
async function handleChatMemberUpdate(ctx) {
  const upd = ctx.update?.chat_member;
  if (!upd || !upd.chat || !upd.new_chat_member?.user) return;

  const chatId = String(upd.chat.id);
  const user = upd.new_chat_member.user;

  // Abaikan perubahan status bot sendiri (mis. bot dijadikan admin)
  try {
    const me = ctx.botInfo?.id || (await ctx.telegram.getMe()).id;
    if (String(user.id) === String(me)) return;
  } catch {
    // lanjut tanpa cek bila getMe gagal
  }

  const action = classifyChatMemberUpdate(upd.old_chat_member?.status, upd.new_chat_member.status);
  if (!action) return;

  db.ensureUser(user);

  if (action === 'join') {
    await deliverWelcome(ctx.telegram, chatId, upd.chat.title, user);
  } else {
    await deliverGoodbye(ctx.telegram, chatId, upd.chat.title, user);
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

  // 2. Goodbye Message (inti di deliverGoodbye — dipakai juga oleh fallback chat_member)
  await deliverGoodbye(ctx.telegram, chatId, ctx.chat.title, leftMember);
}

module.exports = {
  handleNewChatMembers,
  handleLeftChatMember,
  handleChatMemberUpdate,
  classifyChatMemberUpdate,
  deliverWelcome,
  deliverGoodbye,
  getLastGreetingResult,
};
