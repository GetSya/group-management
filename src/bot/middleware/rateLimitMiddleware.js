/**
 * Rate limit middleware to throttle excessive commands or callback spam per user
 */
const userRates = new Map(); // key: userId -> [timestamps]

async function rateLimitMiddleware(ctx, next) {
  if (!ctx.from) return next();

  const userId = String(ctx.from.id);
  const now = Date.now();
  const windowMs = 3000; // 3 seconds
  const maxActions = 10; // Max 10 interactions per 3 seconds

  const timestamps = userRates.get(userId) || [];
  const recent = timestamps.filter(t => now - t < windowMs);

  if (recent.length >= maxActions) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Rate limit exceeded. Please wait a moment.', { show_alert: true });
    }
    return;
  }

  recent.push(now);
  userRates.set(userId, recent);

  return next();
}

module.exports = rateLimitMiddleware;
