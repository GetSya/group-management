const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const { getUserMention } = require('../../utils/messageUtils');

// In-memory alert cooldown
const adminAlertCooldowns = new Map();

async function adminAlertCommand(ctx) {
  const cid = String(ctx.chat.id);
  const uid = String(ctx.from.id);
  const settings = db.getGroupSettings(cid);
  const adminConfig = settings.adminMention || { enabled: true, cooldown: 60, alertInGroup: true };
  const lang = settings.language || 'en';

  if (!adminConfig.enabled) {
    return;
  }

  const now = Date.now();
  const cooldownMs = (adminConfig.cooldown || 60) * 1000;
  const lastAlert = adminAlertCooldowns.get(`${cid}:${uid}`);

  if (lastAlert && now - lastAlert < cooldownMs) {
    return ctx.reply('⚠️ Please wait before calling administrators again.');
  }

  adminAlertCooldowns.set(`${cid}:${uid}`, now);

  const replyMsg = ctx.message.reply_to_message;
  const reason = ctx.message.text.split(' ').slice(1).join(' ') || (replyMsg ? replyMsg.text : 'Administrative assistance requested');
  const mention = getUserMention(ctx.from, true);

  const alertText = i18n.t(lang, 'adminMention.alert', {
    mention,
    group: ctx.chat.title || 'Group',
    message: reason || 'No details provided',
  });

  return ctx.reply(alertText, { parse_mode: 'HTML' });
}

module.exports = adminAlertCommand;
