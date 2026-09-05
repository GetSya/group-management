const { Telegraf } = require('telegraf');
const env = require('../config/env');
const logger = require('../config/logger');

// Middlewares
const errorMiddleware = require('./middleware/errorMiddleware');
const rateLimitMiddleware = require('./middleware/rateLimitMiddleware');
const groupMiddleware = require('./middleware/groupMiddleware');
const { requireAdmin } = require('./middleware/adminMiddleware');

// Commands
const startCommand = require('./commands/start');
const helpCommand = require('./commands/help');
const settingsCommand = require('./commands/settings');
const rulesCommand = require('./commands/rules');
const warnCommand = require('./commands/warn');
const { warnsCommand, resetWarnsCommand } = require('./commands/warns');
const { blockCommand, blockWordCommand, blockDomainCommand } = require('./commands/block');
const adminAlertCommand = require('./commands/admin');
const tagAdminsCommand = require('./commands/tagadmins');
const { backupCommand, restoreCommand } = require('./commands/backup');

// Handlers & Callbacks
const callbackRouter = require('./callbacks/callbackRouter');
const messageHandler = require('./handlers/messageHandler');
const { handleNewChatMembers, handleLeftChatMember } = require('./handlers/memberHandler');
const handleJoinRequest = require('./handlers/joinRequestHandler');

function createBot() {
  if (!env.BOT_TOKEN) {
    logger.error('BOT_TOKEN is not defined in environment! Please configure .env file.');
  }

  const bot = new Telegraf(env.BOT_TOKEN);

  // Global Middlewares
  bot.use(errorMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(groupMiddleware);

  // Public Commands
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('rules', rulesCommand);
  bot.command('admin', adminAlertCommand);

  // Admin Commands (protected by requireAdmin middleware)
  bot.command('settings', requireAdmin, settingsCommand);
  bot.command('warn', requireAdmin, warnCommand);
  bot.command('warns', warnsCommand);
  bot.command('resetwarns', requireAdmin, resetWarnsCommand);
  bot.command('block', requireAdmin, blockCommand);
  bot.command('blockword', requireAdmin, blockWordCommand);
  bot.command('blockdomain', requireAdmin, blockDomainCommand);
  bot.command('tagadmins', tagAdminsCommand);
  bot.command('backup', requireAdmin, backupCommand);
  bot.command('restore', requireAdmin, restoreCommand);

  // Callback Query Central Router
  bot.on('callback_query', callbackRouter);

  // Join Requests
  bot.on('chat_join_request', handleJoinRequest);

  // Member Events
  bot.on('new_chat_members', handleNewChatMembers);
  bot.on('left_chat_member', handleLeftChatMember);

  // Messages & Media Updates
  bot.on(['message', 'channel_post'], messageHandler);

  return bot;
}

module.exports = {
  createBot,
};
