const { Markup } = require('telegraf');
const { getSettingsKeyboard } = require('../keyboards/settingsKeyboard');
const { isAdmin } = require('../../utils/permissionUtils');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const privateSettingsService = require('../../services/privateSettingsService');

function groupListKeyboard(groups, page = 1, perPage = 5) {
  const totalPages = Math.max(1, Math.ceil(groups.length / perPage));
  const p = Math.max(1, Math.min(totalPages, page));
  const slice = groups.slice((p - 1) * perPage, p * perPage);

  const rows = slice.map(g => [
    Markup.button.callback(`🛡 ${String(g.title || g.id).slice(0, 40)}`, `psettings:select:${g.id}`),
  ]);

  const nav = [];
  if (p > 1) nav.push(Markup.button.callback('⬅️ Prev', `psettings:list:${p - 1}`));
  if (p < totalPages) nav.push(Markup.button.callback('Next ➡️', `psettings:list:${p + 1}`));
  if (nav.length > 0) rows.push(nav);
  rows.push([Markup.button.callback('❌ Tutup', 'psettings:close')]);

  return { keyboard: Markup.inlineKeyboard(rows), page: p, totalPages };
}

async function settingsCommand(ctx) {
  const isPrivate = ctx.chat.type === 'private';

  // --- Mode grup: perilaku lama (cek admin grup ini) ---
  if (!isPrivate) {
    const chatId = String(ctx.chat.id);
    const hasAdmin = await isAdmin(ctx.telegram, chatId, String(ctx.from.id));
    const groupSettings = db.getGroupSettings(chatId);
    const lang = groupSettings.language || 'en';
    if (!hasAdmin) {
      return ctx.reply(i18n.t(lang, 'common.only_admin'));
    }
    const groupName = ctx.chat.title || 'Group';
    const text = i18n.t(lang, 'settings.title', { group_name: groupName });
    const keyboard = getSettingsKeyboard(lang);
    return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }

  // --- Mode private: pilih grup yang dikelola ---
  const userId = String(ctx.from.id);
  const allGroups = Object.values(db.data.groups || {}).filter(g => g.isActive !== false);
  const lang = 'id';

  if (allGroups.length === 0) {
    return ctx.reply(
      '📭 <b>Belum ada grup terdaftar.</b>\n\nTambahkan bot ke grup Anda dan jadikan Administrator, lalu kirim /settings di sini lagi.',
      { parse_mode: 'HTML' }
    );
  }

  // Verifikasi satu per satu: hanya tampilkan grup di mana user adalah admin.
  // Batasi pengecekan paralel agar tidak membanjiri API.
  const adminGroups = [];
  for (const g of allGroups) {
    try {
      const ok = await isAdmin(ctx.telegram, g.id, userId);
      if (ok) adminGroups.push(g);
    } catch {
      // abaikan grup yang gagal dicek
    }
  }

  if (adminGroups.length === 0) {
    return ctx.reply(
      '❌ <b>Kamu bukan admin di grup mana pun yang dikenal bot.</b>\n\nPastikan:\n1. Bot sudah ditambahkan ke grup\n2. Kamu adalah admin grup tersebut\n3. Bot sudah pernah aktif di grup (kirim /start di grup)',
      { parse_mode: 'HTML' }
    );
  }

  // Jika sebelumnya sudah pilih grup, langsung buka dashboard grup itu
  const selected = privateSettingsService.getSelectedGroup(userId);
  if (selected && adminGroups.some(g => String(g.id) === String(selected))) {
    const groupSettings = db.getGroupSettings(selected);
    const gLang = groupSettings.language || 'id';
    const group = adminGroups.find(g => String(g.id) === String(selected));
    const text =
      `${i18n.t(gLang, 'settings.title', { group_name: group.title || selected })}\n\n` +
      `📍 <i>Mode private — perubahan berlaku untuk grup ini.</i>\n` +
      `🔄 Ganti grup: /settings`;
    // tandai konteks agar callback berikutnya tahu targetnya
    ctx.targetChatId = String(selected);
    return ctx.reply(text, { parse_mode: 'HTML', ...getSettingsKeyboard(gLang) });
  }

  const { keyboard, page, totalPages } = groupListKeyboard(adminGroups, 1);
  return ctx.reply(
    `🛡 <b>Pilih grup yang ingin diatur</b> (Hal ${page}/${totalPages}):\n\nKamu admin di <b>${adminGroups.length}</b> grup. Pengaturan yang kamu ubah di sini berlaku untuk grup yang dipilih.`,
    { parse_mode: 'HTML', ...keyboard }
  );
}

module.exports = settingsCommand;
module.exports.groupListKeyboard = groupListKeyboard;
