const db = require('../../database/database');
const i18n = require('../../services/i18nService');

async function rulesCommand(ctx) {
  if (ctx.chat.type === 'private') {
    return ctx.reply('⚠️ Please use /rules inside a group.');
  }

  const chatId = String(ctx.chat.id);
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'en';
  const reg = groupSettings.regulation || {};

  if (!reg.enabled) {
    return ctx.reply('ℹ️ Group rules are currently not enabled.');
  }

  const rulesText = reg.rules || 'No rules configured.';
  const text = `📜 <b>Group Rules for ${ctx.chat.title || 'Group'}:</b>\n\n${rulesText}`;

  return ctx.reply(text, { parse_mode: 'HTML' });
}

module.exports = rulesCommand;
