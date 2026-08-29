const actionService = require('../../services/actionService');
const { getUserMention } = require('../../utils/messageUtils');

async function warnCommand(ctx) {
  const replyMessage = ctx.message.reply_to_message;
  let targetUser = null;
  let reason = 'Rule violation';

  const parts = ctx.message.text.split(' ').slice(1);

  if (replyMessage && replyMessage.from) {
    targetUser = replyMessage.from;
    if (parts.length > 0) {
      reason = parts.join(' ');
    }
  } else if (parts.length > 0) {
    // If mentioned via entity
    const entities = ctx.message.entities || [];
    const textMention = entities.find(e => e.type === 'text_mention');
    if (textMention && textMention.user) {
      targetUser = textMention.user;
      reason = parts.slice(1).join(' ') || reason;
    }
  }

  if (!targetUser) {
    return ctx.reply('⚠️ Please reply to a message or mention the user to warn them: <code>/warn [reason]</code>', { parse_mode: 'HTML' });
  }

  if (targetUser.is_bot) {
    return ctx.reply('❌ Bots cannot be warned.');
  }

  return actionService.warnUser(ctx.telegram, ctx.chat.id, targetUser, ctx.from, reason);
}

module.exports = warnCommand;
