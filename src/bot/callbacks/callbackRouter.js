const { parseCallback } = require('../../utils/callbackParser');
const { isAdmin } = require('../../utils/permissionUtils');
const settingsRegistry = require('../../modules/settingsRegistry');
const { getSettingsKeyboard } = require('../keyboards/settingsKeyboard');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const logger = require('../../config/logger');
const actionService = require('../../services/actionService');
const moderationService = require('../../services/moderationService');

async function callbackRouter(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const { module, action, params } = parseCallback(data);
  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);
  const groupSettings = db.getGroupSettings(chatId);
  const lang = groupSettings.language || 'en';

  // 1. Special Handling: Captcha verification button (clicked by member)
  if (module === 'captcha' && action === 'verify') {
    const targetUserId = params[0];
    if (targetUserId && targetUserId !== userId) {
      return ctx.answerCbQuery('❌ This verification button is not for you!', { show_alert: true });
    }

    moderationService.captchaSessions.delete(`${chatId}:${userId}`);
    await ctx.answerCbQuery(i18n.t(lang, 'captcha.passed'));
    await actionService.unmuteUser(ctx.telegram, chatId, userId);
    try {
      await ctx.editMessageText(i18n.t(lang, 'captcha.passed'));
    } catch {
      // Ignored
    }
    return;
  }

  // 2. Special Handling: Join request approval/rejection button (clicked by admin)
  if (module === 'approval' && (action === 'accept' || action === 'reject')) {
    const hasAdmin = await isAdmin(ctx.telegram, chatId, userId);
    if (!hasAdmin) {
      return ctx.answerCbQuery(i18n.t(lang, 'common.only_admin'), { show_alert: true });
    }

    const targetUserId = params[0];
    if (action === 'accept') {
      try {
        await ctx.telegram.approveChatJoinRequest(chatId, targetUserId);
        await ctx.answerCbQuery('Join request approved!');
        await ctx.editMessageText(`✅ Approved join request for <code>${targetUserId}</code>.`, { parse_mode: 'HTML' });
      } catch (err) {
        await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
      }
    } else {
      try {
        await ctx.telegram.declineChatJoinRequest(chatId, targetUserId);
        await ctx.answerCbQuery('Join request rejected.');
        await ctx.editMessageText(`❌ Rejected join request for <code>${targetUserId}</code>.`, { parse_mode: 'HTML' });
      } catch (err) {
        await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
      }
    }
    return;
  }

  // 3. Special Handling: Custom Commands Button and Admin Interactions
  if (module === 'customcmd') {
    const { handleCustomCommandCallback } = require('../../modules/customCommands/customCommandCallback');
    return handleCustomCommandCallback(ctx, action, params);
  }

  // 4. Admin Authorization for all settings menus
  const hasAdmin = await isAdmin(ctx.telegram, chatId, userId);
  if (!hasAdmin) {
    return ctx.answerCbQuery(i18n.t(lang, 'common.only_admin'), { show_alert: true });
  }

  // 4. Close Settings Message
  if (module === 'settings' && action === 'close') {
    await ctx.answerCbQuery();
    try {
      await ctx.deleteMessage();
    } catch (err) {
      logger.debug({ error: err.message }, 'Failed to delete settings message on close');
    }
    return;
  }

  // Check admin status callback
  if (module === 'settings' && action === 'check_admin') {
    const { checkBotPermissions } = require('../../utils/permissionUtils');
    const perms = await checkBotPermissions(ctx.telegram, chatId);
    if (perms.isAdmin && perms.canDeleteMessages && perms.canRestrictMembers) {
      await ctx.answerCbQuery('✅ Bot sudah menjadi Administrator dengan izin lengkap!', { show_alert: true });
      const groupName = ctx.chat.title || 'Group';
      const text = i18n.t(lang, 'settings.title', { group_name: groupName });
      const keyboard = getSettingsKeyboard(lang);
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        // Ignored
      }
    } else {
      await ctx.answerCbQuery('⚠️ Bot belum dijadikan Admin atau hak izin hapus pesan/batasi anggota belum aktif.', { show_alert: true });
    }
    return;
  }

  // Settings Page Switcher
  if (module === 'settings' && action === 'page') {
    await ctx.answerCbQuery();
    const pageNumber = parseInt(params[0], 10) || 1;
    const groupName = ctx.chat.title || 'Group';
    const text = i18n.t(lang, 'settings.title', { group_name: groupName });
    const keyboard = getSettingsKeyboard(lang, pageNumber);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.debug({ error: err.message }, 'Failed to edit main settings page');
      }
    }
    return;
  }

  // 5. Open / Back to Main Settings
  if ((module === 'settings' && (action === 'back' || action === 'main')) || action === 'back' || action === 'main') {
    await ctx.answerCbQuery();
    const groupName = ctx.chat.title || 'Group';
    const text = i18n.t(lang, 'settings.title', { group_name: groupName });
    const keyboard = getSettingsKeyboard(lang, 1);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (err) {
      if (!err.message?.includes('message is not modified')) {
        logger.debug({ error: err.message }, 'Failed to edit main settings');
      }
    }
    return;
  }

  // 6. Direct Settings Navigation (e.g. settings:media, settings:antispam)
  if (module === 'settings') {
    const targetModuleKey = action;
    const targetModule = settingsRegistry.get(targetModuleKey);

    if (targetModule) {
      await ctx.answerCbQuery();
      return targetModule.render(ctx, chatId);
    } else {
      return ctx.answerCbQuery(i18n.t(lang, 'common.invalid_action'), { show_alert: true });
    }
  }

  // 7. Submodule Action Dispatch (e.g. media:toggle:video, antispam:threshold, etc.)
  const targetModule = settingsRegistry.get(module);
  if (targetModule) {
    return targetModule.handleCallback(ctx, action, params);
  }

  // Fallback for invalid callbacks
  return ctx.answerCbQuery(i18n.t(lang, 'common.invalid_action'), { show_alert: true });
}

module.exports = callbackRouter;
