const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');

function getAntispamKeyboard(settings = {}, lang = 'en') {
  const isEnabled = settings.enabled ? '✅' : '❌';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`${i18n.t(lang, 'antispam.toggle_btn')} (${isEnabled})`, 'antispam:toggle'),
    ],
    [
      Markup.button.callback(`⚡ Action: ${(settings.action || 'delete').toUpperCase()}`, 'antispam:action'),
    ],
    [
      Markup.button.callback(`🔢 Threshold: ${settings.threshold || 5}`, 'antispam:threshold'),
      Markup.button.callback(`⏱ Window: ${settings.window || 10}s`, 'antispam:window'),
    ],
    [
      Markup.button.callback(i18n.t(lang, 'common.back'), 'settings:back'),
    ],
  ]);
}

module.exports = {
  getAntispamKeyboard,
};
