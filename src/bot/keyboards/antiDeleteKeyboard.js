const { Markup } = require('telegraf');
const i18n = require('../../services/i18nService');

function getAntiDeleteKeyboard(settings = {}, lang = 'en') {
  const isEnabled = settings.enabled ? '✅' : '❌';

  return Markup.inlineKeyboard([
    // Row 1: Toggle + Log Deletions
    [
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.toggle_btn')} (${isEnabled})`, 'antiDelete:toggle'),
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.log_btn')} (${settings.logDeletions ? '✅' : '❌'})`, 'antiDelete:log'),
    ],
    // Row 2: Notify Admins + Action
    [
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.notify_btn')} (${settings.notifyAdmins ? '✅' : '❌'})`, 'antiDelete:notify'),
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.action_btn', { action: (settings.action || 'log').toUpperCase() })}`, 'antiDelete:action'),
    ],
    // Row 3: Punish User + Threshold
    [
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.punish_btn')} (${settings.punishUser ? '✅' : '❌'})`, 'antiDelete:punish'),
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.threshold_btn', { threshold: settings.punishThreshold || 3 })}`, 'antiDelete:threshold'),
    ],
    // Row 4: Window + Delete Bot Messages
    [
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.window_btn', { window: settings.punishWindow || 300 })}`, 'antiDelete:window'),
      Markup.button.callback(`${i18n.t(lang, 'antiDelete.botmsg_btn')} (${settings.deleteBotMessages ? '✅' : '❌'})`, 'antiDelete:botmsg'),
    ],
    // Back button
    [
      Markup.button.callback(i18n.t(lang, 'common.back'), 'settings:back'),
    ],
  ]);
}

module.exports = {
  getAntiDeleteKeyboard,
};