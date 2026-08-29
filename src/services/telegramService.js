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
      return await telegram.editMessageText(chatId, messageId, undefined, text, {
        parse_mode: 'HTML',
        ...extra,
      });
    } catch (error) {
      // Ignore "message is not modified"
      if (!error.message?.includes('message is not modified')) {
        logger.warn({ chatId, messageId, error: error.message }, 'Failed to edit message');
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
