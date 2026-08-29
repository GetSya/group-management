const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./database/database');
const { createBot } = require('./bot/index');

async function bootstrap() {
  try {
    logger.info('Starting XiamoStore Bot (Telegram Group Management & Moderation Engine)...');

    // 1. Initialize and load JSON Database into memory
    await db.init();
    logger.info({ path: env.DB_PATH }, 'Local JSON Database initialized');

    // 2. Validate Bot Token
    if (!env.BOT_TOKEN) {
      logger.error('CRITICAL: BOT_TOKEN is missing. Please set BOT_TOKEN in your .env file.');
      process.exit(1);
    }

    // 3. Create Bot Instance
    const bot = createBot();

    // 4. Verify Token & Print Identity
    const botInfo = await bot.telegram.getMe();
    logger.info(
      { id: botInfo.id, username: botInfo.username, name: botInfo.first_name },
      '✅ XiamoStore Bot — Group Management By XiamoStore — connected to Telegram successfully!'
    );

    // 5. Graceful Shutdown Handlers (must be set BEFORE launch for Telegraf v4)
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Stopping XiamoStore Bot gracefully...');
      bot.stop(signal);
      await db.forceSave();
      logger.info('Database saved. Process exiting.');
      process.exit(0);
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    // 6. Launch Bot with Long Polling
    logger.info('🚀 Starting Telegram long-polling...');
    await bot.launch({
      dropPendingUpdates: true,
      allowedUpdates: [
        'message',
        'edited_message',
        'callback_query',
        'my_chat_member',
        'chat_member',
        'chat_join_request',
        'poll',
        'poll_answer',
      ],
    });

    logger.info('✅ Bot is now actively polling for group messages and commands.');
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Fatal startup error');
    process.exit(1);
  }
}

bootstrap();
