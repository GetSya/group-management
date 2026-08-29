const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');

function getBackKeyboard(lang = 'en') {
  return Markup.inlineKeyboard([
    [Markup.button.callback(i18n.t(lang, 'common.back'), 'settings:back')],
  ]);
}

function getConfirmationKeyboard(actionKey, lang = 'en') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(i18n.t(lang, 'common.confirm'), `confirm:${actionKey}`),
      Markup.button.callback(i18n.t(lang, 'common.cancel'), 'settings:back'),
    ],
  ]);
}

module.exports = {
  getBackKeyboard,
  getConfirmationKeyboard,
};
