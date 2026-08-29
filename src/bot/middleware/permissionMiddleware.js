const { checkBotPermissions } = require('../../utils/permissionUtils');
const i18n = require('../../services/i18nService');
const db = require('../../database/database');

async function requireBotPermissions(ctx, next) {
  if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
    return next();
  }

  const perms = await checkBotPermissions(ctx.telegram, ctx.chat.id);
  const settings = db.getGroupSettings(ctx.chat.id);
  const lang = settings.language || 'en';

  if (!perms.isAdmin || !perms.canDeleteMessages || !perms.canRestrictMembers) {
    // Only warn if this was a command requiring permissions
    if (ctx.message?.text?.startsWith('/')) {
      return ctx.reply(i18n.t(lang, 'common.missing_permission'), { parse_mode: 'HTML' });
    }
  }

  return next();
}

module.exports = {
  requireBotPermissions,
};
