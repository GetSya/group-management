const pino = require('pino');
const env = require('./env');

const isDev = env.NODE_ENV === 'development';

const logger = pino({
  level: env.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: ['BOT_TOKEN', 'token', 'password', 'secret', 'authorization'],
});

module.exports = logger;
