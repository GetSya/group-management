const { Markup } = require('telegraf');
const { checkBotPermissions } = require('../../utils/permissionUtils');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');

async function startCommand(ctx) {
  const isPrivate = ctx.chat.type === 'private';

  if (isPrivate) {
    const text = `👋 <b>Halo ${ctx.from.first_name || 'Kak'}!</b>\n\nSaya adalah <b>XiamoStore Bot</b>, bot manajemen dan moderasi grup profesional yang siap menjaga grup Anda tetap aman, tertib, dan bersih.\n\n🛡 <b>Fitur Unggulan XiamoStore Bot:</b>\n• Manajemen 12 Jenis Media (Foto, Video, Stiker, Dokumen, dll)\n• Proteksi Anti-Spam & Anti-Flood Otomatis\n• Verifikasi Captcha Anggota Baru\n• Filter Blacklist Kata, Pengguna, & Domain\n• Sistem Peringatan (Warns) & Eskalasi Sanksi\n• Mode Malam (Night Mode) Otomatis\n• Custom Commands & Custom Inline Buttons\n\n👉 <i>Tambahkan bot ke grup Anda dan jadikan Administrator untuk memulai!</i>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.url('➕ Tambahkan ke Grup', `https://t.me/${ctx.botInfo?.username}?startgroup=true`)],
    ]);

    return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }

  // Group / Supergroup handling
  const chatId = ctx.chat.id;
  const groupName = ctx.chat.title || 'Grup';
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'id';

  const botPerms = await checkBotPermissions(ctx.telegram, chatId);

  if (!botPerms.isAdmin || !botPerms.canDeleteMessages || !botPerms.canRestrictMembers) {
    const notAdminText = `⚠️ <b>Peringatan: XiamoStore Bot Belum Menjadi Administrator!</b>\n\nGrup: <b>${groupName}</b>\n\nAgar bot dapat memoderasi grup, menghapus konten terlarang, memblokir spammer, dan menjalankan keamanan grup secara otomatis, harap jadikan <b>XiamoStore Bot</b> sebagai <b>Administrator</b> dengan izin:\n• 🗑 <b>Hapus Pesan</b> (Delete Messages)\n• 🚫 <b>Batasi / Blokir Anggota</b> (Restrict Members)\n• 📌 <b>Sematkan Pesan</b> (Pin Messages)\n• 🔗 <b>Undang Pengguna</b> (Invite Users)\n\n<i>Setelah memberikan hak admin, klik tombol di bawah untuk membuka pengaturan.</i>`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚙️ Pengaturan Grup', 'settings:main')],
      [Markup.button.callback('🔄 Periksa Status Admin', 'settings:check_admin')],
    ]);

    return ctx.reply(notAdminText, { parse_mode: 'HTML', ...keyboard });
  }

  // Bot already is admin
  const activeText = `🛡 <b>XiamoStore Bot Aktif & Siap Melindungi Grup!</b>\n\nGrup: <b>${groupName}</b>\nStatus: <b>🟢 Administrator Aktif</b>\n\nKlik tombol di bawah untuk langsung membuka dashboard pengaturan grup tanpa perlu mengetik /settings:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Pengaturan Grup', 'settings:main')],
  ]);

  return ctx.reply(activeText, { parse_mode: 'HTML', ...keyboard });
}

module.exports = startCommand;
