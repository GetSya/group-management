const db = require('../../database/database');
const privateSettingsService = require('../../services/privateSettingsService');
const { isAdmin, checkBotPermissions } = require('../../utils/permissionUtils');
const { escapeHtml } = require('../../utils/messageUtils');
const { getLastGreetingResult } = require('../handlers/memberHandler');

function resolveTarget(ctx) {
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

function groupNameOf(targetId, ctx) {
  if (ctx.chat.type === 'private') {
    const g = (db.data.groups || {})[String(targetId)];
    return (g && g.title) || targetId;
  }
  return ctx.chat.title || targetId;
}

function onOff(v) {
  return v ? '✅ Aktif' : '❌ Mati';
}

/**
 * /cekwelcome — diagnosa kenapa welcome diam di satu grup padahal
 * di grup lain normal. Hanya untuk admin grup.
 * Menampilkan: status welcome, kartu, timer hapus, captcha, checks,
 * izin bot, dan hasil pengiriman welcome terakhir.
 */
async function welcomeCheckCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;

  if (!(await isAdmin(ctx.telegram, target, String(ctx.from.id)))) {
    return ctx.reply('❌ Hanya administrator grup yang dapat menggunakan perintah ini.');
  }

  const settings = db.getGroupSettings(target);
  const welcome = settings.welcome || {};
  const captcha = settings.captcha || {};
  const checks = settings.checks || {};

  const perms = await checkBotPermissions(ctx.telegram, target);
  const last = getLastGreetingResult(target);

  // Deteksi mode Hidden Members (penyebab welcome/goodbye mati total bila
  // hanya mengandalkan service message). Best-effort: abaikan bila API gagal.
  let hiddenMembers = null;
  try {
    const chat = await ctx.telegram.getChat(target);
    if (chat && typeof chat.has_hidden_members === 'boolean') hiddenMembers = chat.has_hidden_members;
  } catch {
    hiddenMembers = null;
  }

  const lines = [];
  lines.push('🔍 <b>DIAGNOSA WELCOME</b>');
  lines.push(`Grup: <b>${escapeHtml(groupNameOf(target, ctx))}</b> (<code>${escapeHtml(target)}</code>)`);
  lines.push('');
  lines.push(`👋 Welcome: <b>${welcome.enabled ? '✅ AKTIF' : '❌ MATI'}</b>`);
  lines.push(`🖼 Kartu: <b>${welcome.cardEnabled ? 'ON' : 'OFF'}</b>`);
  lines.push(`⏱ Hapus otomatis: <b>${welcome.deleteAfter || 0}s</b>${welcome.deleteAfter > 0 ? ' <i>(pesan terkirim lalu dihapus — kelihatan seperti tidak ada respons!)</i>' : ''}`);
  const msgPreview = String(welcome.message || '👋 Welcome @mention to @group!').slice(0, 200);
  lines.push(`📝 Pesan: <i>${escapeHtml(msgPreview)}</i>`);
  lines.push('');
  lines.push(`🧠 Captcha: <b>${onOff(captcha.enabled)}</b>${captcha.enabled ? ' ⚠️ <i>Captcha AKTIF menggantikan welcome (user baru dapat tombol verifikasi, bukan sapaan).</i>' : ''}`);
  lines.push(`🛠 Checks: <b>${onOff(checks.enabled)}</b>${checks.enabled ? ` <i>(blokir bot: ${checks.blockBots ? 'ya' : 'tidak'}, wajib username: ${checks.requireUsername ? 'ya' : 'tidak'} — user yang kena tendang tidak dapat welcome)</i>` : ''}`);
  lines.push('');
  lines.push(`🤖 Bot admin: <b>${perms.isAdmin ? 'YA' : '❌ BUKAN'}</b>${perms.isAdmin ? '' : ' ⚠️ <i>Jadikan bot admin agar bisa kirim foto/kartu.</i>'}`);
  if (hiddenMembers === true) {
    lines.push('👁 Hidden members: <b>YA (aktif)</b> — <i>Telegram tidak mengirim notif join/leave biasa; bot memakai jalur fallback <code>chat_member</code> (butuh bot admin).</i>');
  } else if (hiddenMembers === false) {
    lines.push('👁 Hidden members: tidak aktif');
  }

  if (last) {
    const when = last.at ? new Date(last.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
    if (last.ok) {
      lines.push(`📊 Welcome terakhir: ✅ terkirim via <b>${escapeHtml(last.method || 'text')}</b> (${when})`);
    } else {
      lines.push(`📊 Welcome terakhir: ❌ <b>GAGAL</b> (${when})`);
      lines.push(`   Error: <code>${escapeHtml(last.error || 'unknown')}</code>`);
    }
  } else {
    lines.push('📊 Welcome terakhir: <i>belum ada member baru sejak bot restart</i>');
  }

  if (!welcome.enabled) {
    lines.push('');
    lines.push('💡 <b>Perbaikan:</b> aktifkan via <code>/settings</code> ➔ 👋 Sambutan ➔ Ganti Status. Setting ini <b>per-grup</b>, grup lain tidak terpengaruh.');
  } else if (captcha.enabled) {
    lines.push('');
    lines.push('💡 <b>Perbaikan:</b> bila ingin sapaan muncul, matikan Captcha via <code>/settings</code> ➔ 🧠 Captcha, atau biarkan (user baru wajib verifikasi dulu).');
  } else if (!perms.isAdmin && welcome.cardEnabled) {
    lines.push('');
    lines.push('💡 <b>Perbaikan:</b> matikan kartu (Sambutan ➔ Card: OFF) atau jadikan bot admin — kartu foto butuh bot admin.');
  }

  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

module.exports = {
  welcomeCheckCommand,
};
