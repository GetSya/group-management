const logger = require('../../config/logger');

async function errorMiddleware(ctx, next) {
  try {
    await next();
  } catch (error) {
    logger.error(
      {
        updateType: ctx.updateType,
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
        error: error.message,
        stack: error.stack,
      },
      'Unhandled error in bot update pipeline'
    );
  }
}

module.exports = errorMiddleware;
