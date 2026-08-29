const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');

function getAntifloodKeyboard(settings = {}, lang = 'en') {
  const isEnabled = settings.enabled ? '✅' : '❌';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`${i18n.t(lang, 'antiflood.toggle_btn')} (${isEnabled})`, 'antiflood:toggle'),
    ],
    [
      Markup.button.callback(`⚡ Action: ${(settings.action || 'mute').toUpperCase()}`, 'antiflood:action'),
    ],
    [
      Markup.button.callback(`🔢 Limit: ${settings.threshold || 5}`, 'antiflood:threshold'),
      Markup.button.callback(`⏱ Window: ${settings.window || 10}s`, 'antiflood:window'),
    ],
    [
      Markup.button.callback(i18n.t(lang, 'common.back'), 'settings:back'),
    ],
  ]);
}

module.exports = {
  getAntifloodKeyboard,
};
