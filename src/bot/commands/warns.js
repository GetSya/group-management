const db = require('../../database/database');
const actionService = require('../../services/actionService');
const { getUserMention } = require('../../utils/messageUtils');

async function warnsCommand(ctx) {
  const replyMessage = ctx.message.reply_to_message;
  let targetUser = replyMessage ? replyMessage.from : ctx.from;

  const cid = String(ctx.chat.id);
  const uid = String(targetUser.id);

  const warnings = db.get('warnings') || [];
  const userWarn = warnings.find(w => w.chatId === cid && w.userId === uid);
  const settings = db.getGroupSettings(cid);
  const maxWarns = settings.warns?.maxWarns || 3;

  const count = userWarn ? userWarn.count : 0;
  const mention = getUserMention(targetUser, true);

  return ctx.reply(`⚠️ ${mention} currently has <b>${count}/${maxWarns}</b> warning(s).`, { parse_mode: 'HTML' });
}

async function resetWarnsCommand(ctx) {
  const replyMessage = ctx.message.reply_to_message;
  if (!replyMessage || !replyMessage.from) {
    return ctx.reply('⚠️ Please reply to the user message whose warnings you want to reset: <code>/resetwarns</code>', { parse_mode: 'HTML' });
  }

  const targetUser = replyMessage.from;
  await actionService.resetWarns(ctx.chat.id, targetUser.id);
  const mention = getUserMention(targetUser, true);

  return ctx.reply(`✅ All warnings have been reset for ${mention}.`, { parse_mode: 'HTML' });
}

module.exports = {
  warnsCommand,
  resetWarnsCommand,
};
