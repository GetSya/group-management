const { isAdmin } = require('../../utils/permissionUtils');
const i18n = require('../../services/i18nService');
const db = require('../../database/database');

async function requireAdmin(ctx, next) {
  if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
    const lang = 'en';
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery(i18n.t(lang, 'common.not_group'), { show_alert: true });
    }
    return ctx.reply(i18n.t(lang, 'common.not_group'));
  }

  if (!ctx.from) return;

  const hasAdmin = await isAdmin(ctx.telegram, ctx.chat.id, ctx.from.id);
  const settings = db.getGroupSettings(ctx.chat.id);
  const lang = settings.language || 'en';

  if (!hasAdmin) {
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery(i18n.t(lang, 'common.only_admin'), { show_alert: true });
    }
    return ctx.reply(i18n.t(lang, 'common.only_admin'));
  }

  return next();
}

module.exports = {
  requireAdmin,
};
