const logger = require('../config/logger');

class TelegramService {
  async safeSendMessage(telegram, chatId, text, extra = {}) {
    try {
      return await telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (error) {
      logger.warn({ chatId, error: error.message }, 'Failed to send Telegram message');
      return null;
    }
  }

  async safeEditMessage(telegram, chatId, messageId, text, extra = {}) {
    try {
      // Telegram limit: 4096 chars for editMessageText
      if (text && text.length > 4096) {
        logger.warn({ chatId, messageId, textLength: text.length }, 'safeEditMessage: text exceeds 4096 chars, truncating');
        text = text.slice(0, 4090) + '\n...';
      }
      return await telegram.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (error) {
      // Ignore "message is not modified"
      if (!error.message?.includes('message is not modified')) {
        logger.warn({ chatId, messageId, textLength: text?.length, error: error.message }, 'Failed to edit message');
      }
      // If edit fails (e.g. message too old), try sending a new message
      if (error.message?.includes('message to edit not found') || error.message?.includes('MESSAGE_ID_INVALID')) {
        try {
          return await telegram.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            ...extra,
          });
        } catch (sendError) {
          logger.warn({ chatId, error: sendError.message }, 'Fallback sendMessage also failed');
        }
      }
      return null;
    }
  }

  async safeAnswerCallback(ctx, text = '', showAlert = false) {
    try {
      await ctx.answerCbQuery(text, { show_alert: showAlert });
    } catch (error) {
      logger.debug({ error: error.message }, 'Failed to answer callback query');
    }
  }
}

module.exports = new TelegramService();
