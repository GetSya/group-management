const db = require('../../database/database');

async function groupMiddleware(ctx, next) {
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    db.ensureGroup(ctx.chat.id, ctx.chat.title, ctx.chat.type);
  }

  if (ctx.from) {
    db.ensureUser(ctx.from);
  }

  return next();
}

module.exports = groupMiddleware;
