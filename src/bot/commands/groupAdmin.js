const db = require('../../database/database');
const adminService = require('../../services/adminService');
const privateSettingsService = require('../../services/privateSettingsService');
const { isAdmin, checkBotPermissions } = require('../../utils/permissionUtils');
const { getUserMention, escapeHtml } = require('../../utils/messageUtils');
const logger = require('../../config/logger');

const PROMOTE_PRIVILEGES = {
  can_change_info: true,
  can_delete_messages: true,
  can_invite_users: true,
  can_restrict_members: true,
  can_pin_messages: true,
  can_promote_members: false,
  can_manage_chat: true,
  can_manage_video_chats: true,
};

const DEMOTE_PRIVILEGES = {
  can_change_info: false,
  can_delete_messages: false,
  can_invite_users: false,
  can_restrict_members: false,
  can_pin_messages: false,
  can_promote_members: false,
  can_manage_chat: false,
  can_manage_video_chats: false,
};

function resolveTargetChat(ctx) {
  if (ctx.chat.type === 'private') {
    const selected = privateSettingsService.getSelectedGroup(String(ctx.from.id));
    if (!selected) {
      ctx.reply('⚠️ Pilih grup dulu via /settings di private chat.');
      return null;
    }
    return String(selected);
  }
  return String(ctx.chat.id);
}

function findUserByUsername(username) {
  const clean = String(username).replace(/^@/, '').toLowerCase();
  const users = db.get('users') || {};
  return Object.values(users).find(u => (u.username || '').toLowerCase() === clean) || null;
}

function parseArgs(ctx) {
  const text = ctx.message.text || '';
  // Dukung /kick@botname arg1 arg2
  const withoutCmd = text.replace(/^\/\w+(@\w+)?\s*/, '');
  return withoutCmd.trim() ? withoutCmd.trim().split(/\s+/) : [];
}

/**
 * Tentukan target user dari reply / mention / username / ID.
 * Return { id, snapshot, reason } atau { error }.
 */
async function resolveTargetUser(ctx, targetChatId, args) {
  const replyUser = ctx.message.reply_to_message?.from;
  if (replyUser) {
    const reason = args.join(' ').trim();
    return { id: String(replyUser.id), snapshot: replyUser, reason };
  }

  const entities = ctx.message.entities || [];
  const textMention = entities.find(e => e.type === 'text_mention' && e.user);
  if (textMention) {
    const reason = args.slice(1).join(' ').trim();
    return { id: String(textMention.user.id), snapshot: textMention.user, reason };
  }

  const raw = (args[0] || '').trim();
  if (!raw) return { error: 'missing' };
  const reason = args.slice(1).join(' ').trim();

  if (/^\d+$/.test(raw)) {
    let snapshot = null;
    try {
      const m = await ctx.telegram.getChatMember(targetChatId, raw);
      if (m?.user) snapshot = m.user;
    } catch {
      const stored = db.get('users', raw);
      if (stored) snapshot = { id: raw, first_name: stored.firstName, username: stored.username };
    }
    return { id: raw, snapshot: snapshot || { id: raw, first_name: `User ${raw}` }, reason };
  }

  if (/^@?[a-zA-Z0-9_]{5,32}$/.test(raw.replace(/^@/, ''))) {
    const found = findUserByUsername(raw);
    if (found) {
      const id = String(found.id || found.telegramId);
      let snapshot = { id, first_name: found.firstName, username: found.username };
      try {
        const m = await ctx.telegram.getChatMember(targetChatId, id);
        if (m?.user) snapshot = m.user;
      } catch {
        // user tidak di grup — tetap pakai snapshot db
      }
      return { id, snapshot, reason };
    }
    return { error: 'not_found', raw };
  }

  return { error: 'invalid', raw };
}

async function ensureCallerAdmin(ctx, targetChatId) {
  if (!(await isAdmin(ctx.telegram, targetChatId, String(ctx.from.id)))) {
    await ctx.reply('❌ Hanya administrator grup yang dapat menggunakan perintah ini.');
    return false;
  }
  return true;
}

async function ensureBotCanRestrict(ctx, targetChatId) {
  const perms = await checkBotPermissions(ctx.telegram, targetChatId);
  if (!perms.isAdmin || !perms.canRestrictMembers) {
    await ctx.reply(
      '⚠️ Bot harus menjadi <b>admin</b> dengan izin <i>Restrict Members</i> untuk perintah ini.',
      { parse_mode: 'HTML' }
    );
    return false;
  }
  return true;
}

async function getMemberStatus(telegram, chatId, userId) {
  try {
    const m = await telegram.getChatMember(chatId, userId);
    return m;
  } catch {
    return null;
  }
}

function usageText(cmd) {
  const map = {
    kick: '⚠️ Pakai: <code>/kick</code> (reply pesan user) atau <code>/kick @username [alasan]</code> atau <code>/kick 123456 [alasan]</code>',
    add: '⚠️ Pakai: <code>/add</code> (reply pesan user) atau <code>/add @username</code> atau <code>/add 123456</code>\n<i>Catatan: Bot API tidak bisa memasukkan user secara paksa — bot akan membuka blokir bila perlu + memberikan link undangan.</i>',
    promote:
      '⚠️ Pakai: <code>/promote</code> (reply pesan user) atau <code>/promote @username [title]</code>',
    demote: '⚠️ Pakai: <code>/demote</code> (reply pesan user) atau <code>/demote @username</code>',
  };
  return map[cmd];
}

function describeTelegramError(e) {
  const msg = e?.response?.description || e?.message || 'Unknown error';
  if (/not enough rights|not enough privileges|not an administrator/i.test(msg)) {
    return 'Bot tidak punya hak yang cukup (jadikan admin dengan izin penuh).';
  }
  if (/user_not_participant|user not found|chat not found/i.test(msg)) {
    return 'User tidak ditemukan di grup ini.';
  }
  if (/can't remove chat owner|can't demote chat creator/i.test(msg)) {
    return 'Owner grup tidak bisa di-kick/demote.';
  }
  if (/bot can't|bot is not/i.test(msg)) return `Telegram menolak: ${msg}`;
  return msg;
}

/**
 * /kick [reply|@username|id] [alasan]
 * Kick = ban lalu unban (user bisa join lagi via link).
 */
async function kickCommand(ctx) {
  const target = resolveTargetChat(ctx);
  if (!target) return;
  if (!(await ensureCallerAdmin(ctx, target))) return;
  if (!(await ensureBotCanRestrict(ctx, target))) return;

  const args = parseArgs(ctx);
  const resolved = await resolveTargetUser(ctx, target, args);
  if (resolved.error) return ctx.reply(usageText('kick'), { parse_mode: 'HTML' });

  const targetId = resolved.id;
  const callerId = String(ctx.from.id);
  let botId = null;
  try {
    botId = String((await ctx.telegram.getMe()).id);
  } catch {
    botId = null;
  }

  if (targetId === callerId) return ctx.reply('❌ Kamu tidak bisa meng-kick dirimu sendiri.');
  if (botId && targetId === botId) return ctx.reply('❌ Aku tidak bisa meng-kick diriku sendiri.');

  const member = await getMemberStatus(ctx.telegram, target, targetId);
  if (member?.status === 'creator') return ctx.reply('❌ Owner grup tidak bisa di-kick.');
  if (member?.status === 'administrator') {
    return ctx.reply('❌ User tersebut adalah admin. Demote dulu sebelum di-kick (<code>/demote</code>).', {
      parse_mode: 'HTML',
    });
  }
  if (member?.user?.is_bot) return ctx.reply('❌ Bot tidak bisa di-kick dengan perintah ini.');

  const reason = resolved.reason || 'Pelanggaran aturan grup';
  const mention = getUserMention(resolved.snapshot || { id: targetId }, true);

  try {
    await ctx.telegram.banChatMember(target, targetId);
    // Unban langsung agar efeknya "kick" (bisa join lagi), bukan "ban" permanen.
    try {
      await ctx.telegram.unbanChatMember(target, targetId);
    } catch (unbanErr) {
      logger.debug({ error: unbanErr.message }, 'Unban setelah kick gagal (kick tetap berlaku sebagai ban)');
    }
    adminService.logAdminAction(target, callerId, 'kick', targetId, reason);
    return ctx.reply(`👢 ${mention} telah di-<b>kick</b>.\nAlasan: <i>${escapeHtml(reason)}</i>`, {
      parse_mode: 'HTML',
    });
  } catch (e) {
    logger.warn({ error: e.message, target, targetId }, 'Kick gagal');
    return ctx.reply(`❌ Gagal kick: ${escapeHtml(describeTelegramError(e))}`);
  }
}

/**
 * /add [reply|@username|id]
 * Bot API tidak mengizinkan bot "menambahkan" user arbitrer.
 * Implementasi: unban (bila user pernah di-ban) + kirim link undangan grup.
 */
async function addCommand(ctx) {
  const target = resolveTargetChat(ctx);
  if (!target) return;
  if (!(await ensureCallerAdmin(ctx, target))) return;

  const perms = await checkBotPermissions(ctx.telegram, target);
  if (!perms.isAdmin || !perms.canInviteUsers) {
    return ctx.reply(
      '⚠️ Bot harus menjadi <b>admin</b> dengan izin <i>Invite Users</i> untuk perintah ini.',
      { parse_mode: 'HTML' }
    );
  }

  const args = parseArgs(ctx);
  const resolved = await resolveTargetUser(ctx, target, args);
  if (resolved.error === 'missing') {
    // Tanpa target: cukup berikan link undangan grup.
    try {
      const link = await createInviteLink(ctx.telegram, target);
      return ctx.reply(`🔗 <b>Link undangan grup:</b>\n${escapeHtml(link)}`, { parse_mode: 'HTML' });
    } catch (e) {
      return ctx.reply(`❌ Gagal membuat link undangan: ${escapeHtml(describeTelegramError(e))}`);
    }
  }
  if (resolved.error) return ctx.reply(usageText('add'), { parse_mode: 'HTML' });

  const targetId = resolved.id;
  const mention = getUserMention(resolved.snapshot || { id: targetId }, true);

  // Coba buka blokir dulu (tidak masalah bila user tidak di-ban).
  try {
    await ctx.telegram.unbanChatMember(target, targetId);
  } catch (e) {
    logger.debug({ error: e.message }, 'Unban saat /add gagal, lanjut kirim invite link');
  }

  try {
    const link = await createInviteLink(ctx.telegram, target);
    adminService.logAdminAction(target, String(ctx.from.id), 'add', targetId, link);
    return ctx.reply(
      `➕ ${mention} sudah di-<b>unban</b> (bila sebelumnya diblokir).\n\nBot tidak bisa memasukkan user secara paksa, bagikan link ini agar user bisa join:\n🔗 ${escapeHtml(link)}`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    logger.warn({ error: e.message }, 'Add/invite gagal');
    return ctx.reply(`❌ Gagal membuat link undangan: ${escapeHtml(describeTelegramError(e))}`);
  }
}

async function createInviteLink(telegram, chatId) {
  try {
    const res = await telegram.createChatInviteLink(chatId, { name: `add-${Date.now()}` });
    if (res?.invite_link) return res.invite_link;
  } catch {
    // fallback ke invite link utama
  }
  return telegram.exportChatInviteLink(chatId);
}

/**
 * /promote [reply|@username|id] [custom title]
 */
async function promoteCommand(ctx) {
  const target = resolveTargetChat(ctx);
  if (!target) return;
  if (!(await ensureCallerAdmin(ctx, target))) return;
  if (!(await ensureBotCanRestrict(ctx, target))) return;
  // Promote juga butuh izin promote_members di sisi Bot API.
  try {
    const me = await ctx.telegram.getMe();
    const botMember = await ctx.telegram.getChatMember(target, me.id);
    if (botMember.status !== 'creator' && botMember.can_promote_members === false) {
      return ctx.reply('⚠️ Bot butuh izin <i>Promote Members</i> untuk mempromosikan admin baru.', {
        parse_mode: 'HTML',
      });
    }
  } catch {
    // abaikan, lanjut — API akan menolak bila memang tak berizin
  }

  const args = parseArgs(ctx);
  const resolved = await resolveTargetUser(ctx, target, args);
  if (resolved.error) return ctx.reply(usageText('promote'), { parse_mode: 'HTML' });

  const targetId = resolved.id;
  // Title = sisa alasan, dibatasi 16 char (limit Telegram custom title).
  const title = (resolved.reason || '').slice(0, 16).trim() || undefined;

  const member = await getMemberStatus(ctx.telegram, target, targetId);
  if (!member) return ctx.reply('❌ User tidak ditemukan di grup ini. User harus join dulu sebelum dipromote.');
  if (member.status === 'creator') return ctx.reply('❌ Dia sudah Owner grup.');
  if (member.status === 'left' || member.status === 'kicked') {
    return ctx.reply('❌ User tidak ada di grup (sudah keluar/di-ban). Gunakan <code>/add</code> dulu.', {
      parse_mode: 'HTML',
    });
  }
  if (member.user?.is_bot) return ctx.reply('❌ Bot tidak bisa dipromote menjadi admin grup.');

  const mention = getUserMention(member.user || resolved.snapshot || { id: targetId }, true);

  try {
    await ctx.telegram.promoteChatMember(target, targetId, PROMOTE_PRIVILEGES);
    if (title) {
      try {
        await ctx.telegram.setChatAdministratorCustomTitle(target, targetId, title);
      } catch (titleErr) {
        logger.debug({ error: titleErr.message }, 'Set custom title gagal, promote tetap berlaku');
      }
    }
    adminService.logAdminAction(target, String(ctx.from.id), 'promote', targetId, title || '');
    const titleLine = title ? `\n🏷 Title: <b>${escapeHtml(title)}</b>` : '';
    return ctx.reply(`🛡 ${mention} telah di-<b>promote</b> menjadi admin.${titleLine}`, { parse_mode: 'HTML' });
  } catch (e) {
    logger.warn({ error: e.message }, 'Promote gagal');
    return ctx.reply(`❌ Gagal promote: ${escapeHtml(describeTelegramError(e))}`);
  }
}

/**
 * /demote [reply|@username|id]
 */
async function demoteCommand(ctx) {
  const target = resolveTargetChat(ctx);
  if (!target) return;
  if (!(await ensureCallerAdmin(ctx, target))) return;
  if (!(await ensureBotCanRestrict(ctx, target))) return;

  const args = parseArgs(ctx);
  const resolved = await resolveTargetUser(ctx, target, args);
  if (resolved.error) return ctx.reply(usageText('demote'), { parse_mode: 'HTML' });

  const targetId = resolved.id;
  const member = await getMemberStatus(ctx.telegram, target, targetId);
  if (!member) return ctx.reply('❌ User tidak ditemukan di grup ini.');
  if (member.status === 'creator') return ctx.reply('❌ Owner grup tidak bisa di-demote.');
  if (member.status !== 'administrator') {
    return ctx.reply('❌ User tersebut bukan admin, tidak ada yang perlu di-demote.');
  }

  const mention = getUserMention(member.user || resolved.snapshot || { id: targetId }, true);

  try {
    await ctx.telegram.promoteChatMember(target, targetId, DEMOTE_PRIVILEGES);
    adminService.logAdminAction(target, String(ctx.from.id), 'demote', targetId, '');
    return ctx.reply(`📉 ${mention} telah di-<b>demote</b> menjadi member biasa.`, { parse_mode: 'HTML' });
  } catch (e) {
    logger.warn({ error: e.message }, 'Demote gagal');
    return ctx.reply(`❌ Gagal demote: ${escapeHtml(describeTelegramError(e))}`);
  }
}

module.exports = {
  kickCommand,
  addCommand,
  promoteCommand,
  demoteCommand,
  // diekspor untuk unit test
  resolveTargetUser,
  parseArgs,
  PROMOTE_PRIVILEGES,
  DEMOTE_PRIVILEGES,
};
