const { Markup } = require('telegraf');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const { getUserMention } = require('../../utils/messageUtils');
const logger = require('../../config/logger');

async function handleJoinRequest(ctx) {
  const joinRequest = ctx.chatJoinRequest;
  if (!joinRequest) return;

  const chatId = String(joinRequest.chat.id);
  const user = joinRequest.from;
  const userId = String(user.id);

  const groupSettings = db.getGroupSettings(chatId);
  const app = groupSettings.approval || { enabled: false, autoApprove: false, notifyAdmins: true };
  const lang = groupSettings.language || 'en';

  if (!app.enabled) {
    return;
  }

  // 1. Auto Approval if enabled
  if (app.autoApprove) {
    try {
      await ctx.telegram.approveChatJoinRequest(chatId, userId);
      logger.info({ chatId, userId }, 'Auto approved join request');
      return;
    } catch (err) {
      logger.error({ error: err.message }, 'Failed to auto approve join request');
    }
  }

  // 2. Notify Administrators in Group with Accept/Reject Buttons
  if (app.notifyAdmins) {
    const mention = getUserMention(user, true);
    const text = i18n.t(lang, 'approval.new_request', {
      mention,
      username: user.username || 'none',
      userId,
    });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(i18n.t(lang, 'approval.approve_btn'), `approval:accept:${userId}`),
        Markup.button.callback(i18n.t(lang, 'approval.reject_btn'), `approval:reject:${userId}`),
      ],
    ]);

    try {
      await ctx.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (err) {
      logger.debug({ error: err.message }, 'Failed to send join request alert');
    }
  }
}

module.exports = handleJoinRequest;
