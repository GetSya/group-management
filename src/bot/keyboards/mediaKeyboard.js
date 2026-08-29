const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');
const { MEDIA_TYPES } = require('../../config/constants');

/**
 * Builds the Media Submenu keyboard with real-time toggle status indicators
 */
function getMediaKeyboard(mediaSettings = {}, lang = 'en') {
  const buttons = [];

  // Group media toggles 2 per row
  for (let i = 0; i < MEDIA_TYPES.length; i += 2) {
    const type1 = MEDIA_TYPES[i];
    const type2 = MEDIA_TYPES[i + 1];

    const row = [];
    const status1 = mediaSettings[type1] ? '✅' : '❌';
    row.push(Markup.button.callback(`${i18n.t(lang, `media.${type1}`)} ${status1}`, `media:toggle:${type1}`));

    if (type2) {
      const status2 = mediaSettings[type2] ? '✅' : '❌';
      row.push(Markup.button.callback(`${i18n.t(lang, `media.${type2}`)} ${status2}`, `media:toggle:${type2}`));
    }
    buttons.push(row);
  }

  // Row for Allow All & Deny All
  buttons.push([
    Markup.button.callback(i18n.t(lang, 'media.allow_all'), 'media:allow_all'),
    Markup.button.callback(i18n.t(lang, 'media.deny_all'), 'media:deny_all'),
  ]);

  // Back button
  buttons.push([
    Markup.button.callback(i18n.t(lang, 'common.back'), 'settings:back'),
  ]);

  return Markup.inlineKeyboard(buttons);
}

module.exports = {
  getMediaKeyboard,
};
