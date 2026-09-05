const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');

/**
 * Builds the 4 rows x 2 columns Settings Keyboard with bottom fixed actions
 * Supports 2 pages so all group management modules are 100% accessible cleanly.
 */
function getSettingsKeyboard(lang = 'id', page = 1) {
  const isPage1 = page === 1;

  // 4 rows x 2 columns top grid
  const page1Grid = [
    // Row 1
    [
      Markup.button.callback(i18n.t(lang, 'settings.regulation'), 'settings:regulation'),
      Markup.button.callback(i18n.t(lang, 'settings.antispam'), 'settings:antispam'),
    ],
    // Row 2
    [
      Markup.button.callback(i18n.t(lang, 'settings.welcome'), 'settings:welcome'),
      Markup.button.callback(i18n.t(lang, 'settings.antiflood'), 'settings:antiflood'),
    ],
    // Row 3
    [
      Markup.button.callback(i18n.t(lang, 'settings.goodbye'), 'settings:goodbye'),
      Markup.button.callback(i18n.t(lang, 'settings.alphabets'), 'settings:alphabets'),
    ],
    // Row 4
    [
      Markup.button.callback(i18n.t(lang, 'settings.captcha'), 'settings:captcha'),
      Markup.button.callback(i18n.t(lang, 'settings.checks'), 'settings:checks'),
    ],
    // Page Switcher
    [
      Markup.button.callback('⏩ Menu Lanjutan (Hal 2/2) ➡️', 'settings:page:2'),
    ],
  ];

  const page2Grid = [
    // Row 1
    [
      Markup.button.callback(i18n.t(lang, 'settings.admin'), 'settings:adminMention'),
      Markup.button.callback(i18n.t(lang, 'settings.blocks'), 'settings:blocks'),
    ],
    // Row 2
    [
      Markup.button.callback(i18n.t(lang, 'settings.media'), 'settings:media'),
      Markup.button.callback(i18n.t(lang, 'settings.porn'), 'settings:porn'),
    ],
    // Row 3
    [
      Markup.button.callback(i18n.t(lang, 'settings.warns'), 'settings:warns'),
      Markup.button.callback(i18n.t(lang, 'settings.night'), 'settings:night'),
    ],
    // Row 4
    [
      Markup.button.callback(i18n.t(lang, 'settings.tag'), 'settings:tag'),
      Markup.button.callback(i18n.t(lang, 'settings.link'), 'settings:link'),
    ],
    // Row 5 — pindahan dari bottom layout agar Hal 1 ramping
    [
      Markup.button.callback(i18n.t(lang, 'settings.guardian'), 'settings:guardian'),
      Markup.button.callback(i18n.t(lang, 'settings.approval'), 'settings:approval'),
    ],
    // Row 6 — pindahan dari bottom layout
    [
      Markup.button.callback(i18n.t(lang, 'settings.deleting'), 'settings:deletingMessages'),
      Markup.button.callback(i18n.t(lang, 'settings.grouplock'), 'settings:groupLock'),
    ],
    // Page Switcher
    [
      Markup.button.callback('⏪ Menu Utama (Hal 1/2) ⬅️', 'settings:page:1'),
    ],
  ];

  const currentGrid = isPage1 ? page1Grid : page2Grid;

  // Fixed Bottom Layout — ramping: hanya Bahasa & Tutup + Lainnya.
  // Guardian / Approval / Penghapusan Pesan / Buka-Tutup kini ada di Hal 2/2.
  const bottomLayout = [
    // 2 columns: Bahasa & Tutup
    [
      Markup.button.callback(i18n.t(lang, 'settings.lang'), 'settings:lang'),
      Markup.button.callback(i18n.t(lang, 'common.close'), 'settings:close'),
    ],
    // Full width: Lainnya
    [
      Markup.button.callback(i18n.t(lang, 'settings.other'), 'settings:other'),
    ],
  ];

  return Markup.inlineKeyboard([...currentGrid, ...bottomLayout]);
}

module.exports = {
  getSettingsKeyboard,
};
