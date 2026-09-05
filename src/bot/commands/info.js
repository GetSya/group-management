const db = require('../../database/database');
const { getUserMention, escapeHtml } = require('../../utils/messageUtils');
const privateSettingsService = require('../../services/privateSettingsService');

function findUserByUsername(username) {
  const clean = String(username).replace(/^@/, '').toLowerCase();
  const users = db.get('users') || {};
  return Object.values(users).find(u => (u.username || '').toLowerCase() === clean) || null;
}

function statusLabel(member) {
  if (!member) return { emoji: '❔', text: 'Tidak diketahui' };
  switch (member.status) {
    case 'creator':
      return { emoji: '👑', text: 'Owner' };
    case 'administrator':
      return { emoji: '🛡', text: member.custom_title ? `Admin (${escapeHtml(member.custom_title)})` : 'Admin' };
    case 'member':
      return { emoji: '👤', text: 'Member' };
    case 'restricted':
      return { emoji: '⛔', text: 'Restricted / Muted' };
    case 'left':
      return { emoji: '🚪', text: 'Sudah keluar' };
    case 'kicked':
      return { emoji: '🚫', text: 'Banned' };
    default:
      return { emoji: '👤', text: escapeHtml(member.status) };
  }
}

/**
 * /info [reply|@username|user_id]
 * Tanpa argumen = info diri sendiri.
 * Di private: pakai grup terpilih via /settings bila ada.
 */
async function infoCommand(ctx) {
  const isPrivate = ctx.chat.type === 'private';
  const requesterId = String(ctx.from.id);

  let targetGroupId = null;
  if (isPrivate) {
    targetGroupId = privateSettingsService.getSelectedGroup(requesterId);
    if (targetGroupId) targetGroupId = String(targetGroupId);
  } else {
    targetGroupId = String(ctx.chat.id);
  }

  const lang = targetGroupId ? (db.getGroupSettings(targetGroupId).language || 'id') : 'id';

  // --- Tentukan target user ---
  const replyUser = ctx.message.reply_to_message?.from;
  const args = (ctx.message.text || '').split(/\s+/).slice(1);
  let targetId = null;
  let targetSnapshot = null; // info dasar bila user tidak ada di grup

  if (replyUser) {
    targetId = String(replyUser.id);
    targetSnapshot = replyUser;
  } else if (args[0]) {
    const raw = args[0].trim();
    if (/^\d+$/.test(raw)) {
      targetId = raw;
    } else if (/^@?[a-zA-Z0-9_]{5,32}$/.test(raw.replace(/^@/, ''))) {
      const found = findUserByUsername(raw);
      if (found) {
        targetId = String(found.id || found.telegramId);
        targetSnapshot = { id: targetId, first_name: found.firstName, username: found.username };
      } else {
        return ctx.reply(
          `❌ Username <code>${escapeHtml(raw)}</code> tidak ditemukan di database bot.\nGunakan <i>reply</i> ke pesan user atau kirim ID numerik.`,
          { parse_mode: 'HTML' }
        );
      }
    } else {
      return ctx.reply('❌ Format tidak valid. Pakai: <code>/info</code>, <code>/info @username</code>, <code>/info 123456</code>, atau reply pesan user.', { parse_mode: 'HTML' });
    }
  } else {
    targetId = requesterId;
    targetSnapshot = ctx.from;
  }

  // --- Ambil data member grup (bila ada konteks grup) ---
  let member = null;
  let userObj = targetSnapshot;
  if (targetGroupId) {
    try {
      member = await ctx.telegram.getChatMember(targetGroupId, targetId);
      userObj = member.user || targetSnapshot;
    } catch {
      // user tidak di grup / bot tak bisa akses → fallback ke snapshot/db
      const stored = db.get('users', targetId);
      if (stored) {
        userObj = { id: targetId, first_name: stored.firstName, last_name: stored.lastName, username: stored.username };
      }
    }
  }

  if (!userObj) userObj = { id: targetId };

  const fullName = [userObj.first_name, userObj.last_name].filter(Boolean).join(' ') || userObj.first_name || 'User';
  const mention = getUserMention(userObj, true);
  const usernameStr = userObj.username ? `@${escapeHtml(userObj.username)}` : '<i>-</i>';
  const langCode = userObj.language_code ? escapeHtml(userObj.language_code) : '<i>-</i>';
  const isBot = userObj.is_bot ? '🤖 Ya' : '👤 Bukan';
  const st = statusLabel(member);

  // --- Warn & block (konteks grup) ---
  let warnLine = '';
  let blockLine = '';
  if (targetGroupId) {
    const warnings = db.get('warnings') || [];
    const uw = warnings.find(w => w.chatId === String(targetGroupId) && w.userId === String(targetId));
    const settings = db.getGroupSettings(targetGroupId);
    const maxWarns = settings.warns?.maxWarns || 3;
    warnLine = `\n⚠️ Warn: <b>${uw ? uw.count : 0}/${maxWarns}</b>`;

    const blocks = db.get('blocks') || [];
    const hit = blocks.find(b => {
      if (String(b.chatId) !== String(targetGroupId)) return false;
      const t = (b.type || '').toLowerCase();
      const v = String(b.value || '').toLowerCase();
      if (t === 'user' && v === String(targetId)) return true;
      if (t === 'username' && userObj.username && (v === `@${userObj.username.toLowerCase()}` || v === userObj.username.toLowerCase())) return true;
      return false;
    });
    if (hit) blockLine = `\n🔐 Blocklist: <b>YA (${escapeHtml(hit.type)})</b>`;
  }

  const groupLine = targetGroupId
    ? `\n👥 Grup: <b>${escapeHtml(((db.data.groups || {})[String(targetGroupId)] || {}).title || targetGroupId)}</b>\n${st.emoji} Status: <b>${st.text}</b>`
    : `\n<i>Tanpa konteks grup — pilih grup via /settings untuk status & warn.</i>`;

  const caption =
    `👤 <b>INFORMASI PENGGUNA</b>\n\n` +
    `${mention}\n` +
    `📛 Nama: <b>${escapeHtml(fullName)}</b>\n` +
    `🆔 ID: <code>${targetId}</code>\n` +
    `📎 Username: ${usernameStr}\n` +
    `🌐 Bahasa: ${langCode}\n` +
    `🤖 Bot: ${isBot}` +
    `${groupLine}${warnLine}${blockLine}`;

  // Kirim dengan foto profil bila tersedia
  try {
    const photos = await ctx.telegram.getUserProfilePhotos(targetId, 0, 1);
    const fileId = photos?.photos?.[0]?.[0]?.file_id;
    if (fileId) {
      return ctx.replyWithPhoto(fileId, { caption, parse_mode: 'HTML' });
    }
  } catch {
    // abaikan, fallback ke teks
  }
  return ctx.reply(caption, { parse_mode: 'HTML' });
}

module.exports = infoCommand;
