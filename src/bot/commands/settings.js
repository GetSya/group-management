const { getSettingsKeyboard } = require('../keyboards/settingsKeyboard');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');

async function settingsCommand(ctx) {
  if (ctx.chat.type === 'private') {
    return ctx.reply('⚠️ Please use /settings inside a group or supergroup.');
  }

  const chatId = String(ctx.chat.id);
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'en';

  const groupName = ctx.chat.title || 'Group';
  const text = i18n.t(lang, 'settings.title', { group_name: groupName });
  const keyboard = getSettingsKeyboard(lang);

  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...keyboard,
  });
}

module.exports = settingsCommand;
