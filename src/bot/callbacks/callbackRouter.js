const { Markup } = require('telegraf');
const { parseCallback } = require('../../utils/callbackParser');
const { isAdmin } = require('../../utils/permissionUtils');
const settingsRegistry = require('../../modules/settingsRegistry');
const { getSettingsKeyboard } = require('../keyboards/settingsKeyboard');
const { groupListKeyboard } = require('../commands/settings');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const logger = require('../../config/logger');
const actionService = require('../../services/actionService');
const moderationService = require('../../services/moderationService');
const privateSettingsService = require('../../services/privateSettingsService');

function getGroupDisplayName(groupId, fallback = 'Group') {
  const g = (db.data.groups || {})[String(groupId)];
  return (g && g.title) || fallback;
}

function dashboardKeyboard(lang, isPrivate, page = 1) {
  const base = getSettingsKeyboard(lang, page);
  if (!isPrivate) return base;
  // Tambahkan baris "Ganti Grup" di atas tombol close agar user private bisa pindah grup.
  // Struktur telegraf: { reply_markup: { inline_keyboard: [...] } }
  try {
    const rows = base.reply_markup.inline_keyboard;
    rows.push([Markup.button.callback('🔄 Ganti Grup', 'psettings:groups')]);
    return base;
  } catch {
    return base;
  }
}

async function renderDashboard(ctx, effectiveChatId, lang, isPrivate, groupName) {
  const name = groupName || getGroupDisplayName(effectiveChatId, ctx.chat.title || 'Group');
  let text = i18n.t(lang, 'settings.title', { group_name: name });
  if (isPrivate) {
    text += `\n\n📍 <i>Mode private — perubahan berlaku untuk grup ini.</i>`;
  }
  const keyboard = dashboardKeyboard(lang, isPrivate, 1);
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    if (!err.message?.includes('message is not modified')) {
      logger.debug({ error: err.message }, 'Failed to edit dashboard');
    }
  }
}

async function collectAdminGroups(telegram, userId) {
  const allGroups = Object.values(db.data.groups || {}).filter(g => g.isActive !== false);
  const adminGroups = [];
  for (const g of allGroups) {
    try {
      if (await isAdmin(telegram, g.id, userId)) adminGroups.push(g);
    } catch {
      // abaikan
    }
  }
  return adminGroups;
}

async function callbackRouter(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const { module, action, params } = parseCallback(data);
  const isPrivate = ctx.chat.type === 'private';
  const userId = String(ctx.from.id);

  // ---- 0. Private group picker (psettings:*) — tanpa butuh pilihan grup dulu ----
  if (module === 'psettings') {
    if (action === 'close') {
      privateSettingsService.clearSelectedGroup(userId);
      await ctx.answerCbQuery();
      try {
        await ctx.deleteMessage();
      } catch (err) {
        logger.debug({ error: err.message }, 'Failed to delete private picker on close');
      }
      return;
    }

    if (action === 'groups' || action === 'list') {
      await ctx.answerCbQuery();
      const adminGroups = await collectAdminGroups(ctx.telegram, userId);
      if (adminGroups.length === 0) {
        return ctx.answerCbQuery('❌ Kamu bukan admin di grup mana pun.', { show_alert: true });
      }
      const page = action === 'list' ? parseInt(params[0], 10) || 1 : 1;
      const { keyboard, page: p, totalPages } = groupListKeyboard(adminGroups, page);
      const text = `🛡 <b>Pilih grup yang ingin diatur</b> (Hal ${p}/${totalPages}):\n\nKamu admin di <b>${adminGroups.length}</b> grup.`;
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch (err) {
        if (!err.message?.includes('message is not modified')) {
          await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
        }
      }
      return;
    }

    if (action === 'select') {
      const groupId = String(params[0] || '');
      if (!groupId) return ctx.answerCbQuery('❌ Grup tidak valid.', { show_alert: true });
      const ok = await isAdmin(ctx.telegram, groupId, userId);
      if (!ok) {
        return ctx.answerCbQuery('❌ Kamu bukan admin grup ini.', { show_alert: true });
      }
      privateSettingsService.setSelectedGroup(userId, groupId);
      ctx.targetChatId = groupId;
      await ctx.answerCbQuery();
      const groupSettings = db.getGroupSettings(groupId);
      const lang = groupSettings.language || 'id';
      await renderDashboard(ctx, groupId, lang, true);
      return;
    }

    return ctx.answerCbQuery(i18n.t('id', 'common.invalid_action'), { show_alert: true });
  }

  // ---- Tentukan grup target efektif ----
  let effectiveChatId;
  if (isPrivate) {
    effectiveChatId = privateSettingsService.getSelectedGroup(userId);
    if (!effectiveChatId) {
      return ctx.answerCbQuery('⚠️ Pilih grup dulu via /settings.', { show_alert: true });
    }
    ctx.targetChatId = String(effectiveChatId);
  } else {
    effectiveChatId = String(ctx.chat.id);
    ctx.targetChatId = effectiveChatId;
  }

  const groupSettings = db.getGroupSettings(effectiveChatId);
  const lang = groupSettings.language || 'en';
  const groupName = isPrivate
    ? getGroupDisplayName(effectiveChatId, 'Group')
    : ctx.chat.title || 'Group';

  // 1. Captcha verify (hanya relevan di grup; di private abaikan)
  if (!isPrivate && module === 'captcha' && action === 'verify') {
    const targetUserId = params[0];
    if (targetUserId && targetUserId !== userId) {
      return ctx.answerCbQuery('❌ This verification button is not for you!', { show_alert: true });
    }

    moderationService.captchaSessions.delete(`${effectiveChatId}:${userId}`);
    await ctx.answerCbQuery(i18n.t(lang, 'captcha.passed'));
    await actionService.unmuteUser(ctx.telegram, effectiveChatId, userId);
    try {
      await ctx.editMessageText(i18n.t(lang, 'captcha.passed'));
    } catch {
      // Ignored
    }
    return;
  }

  // 2. Join request approval (hanya di grup)
  if (!isPrivate && module === 'approval' && (action === 'accept' || action === 'reject')) {
    const hasAdmin = await isAdmin(ctx.telegram, effectiveChatId, userId);
    if (!hasAdmin) {
      return ctx.answerCbQuery(i18n.t(lang, 'common.only_admin'), { show_alert: true });
    }

    const targetUserId = params[0];
    if (action === 'accept') {
      try {
        await ctx.telegram.approveChatJoinRequest(effectiveChatId, targetUserId);
        await ctx.answerCbQuery('Join request approved!');
        await ctx.editMessageText(`✅ Approved join request for <code>${targetUserId}</code>.`, { parse_mode: 'HTML' });
      } catch (err) {
        await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
      }
    } else {
      try {
        await ctx.telegram.declineChatJoinRequest(effectiveChatId, targetUserId);
        await ctx.answerCbQuery('Join request rejected.');
        await ctx.editMessageText(`❌ Rejected join request for <code>${targetUserId}</code>.`, { parse_mode: 'HTML' });
      } catch (err) {
        await ctx.answerCbQuery(`Error: ${err.message}`, { show_alert: true });
      }
    }
    return;
  }

  // 3. Custom Commands Button and Admin Interactions
  // Custom command memakai chatId internal; teruskan target via ctx agar konsisten.
  if (module === 'customcmd') {
    const { handleCustomCommandCallback } = require('../../modules/customCommands/customCommandCallback');
    return handleCustomCommandCallback(ctx, action, params);
  }

  // 4. Admin Authorization (terhadap grup target, bukan private chat)
  const hasAdmin = await isAdmin(ctx.telegram, effectiveChatId, userId);
  if (!hasAdmin) {
    if (isPrivate) privateSettingsService.clearSelectedGroup(userId);
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

  // Check admin status callback (cek bot di grup target)
  if (module === 'settings' && action === 'check_admin') {
    const { checkBotPermissions } = require('../../utils/permissionUtils');
    const perms = await checkBotPermissions(ctx.telegram, effectiveChatId);
    if (perms.isAdmin && perms.canDeleteMessages && perms.canRestrictMembers) {
      await ctx.answerCbQuery('✅ Bot sudah menjadi Administrator dengan izin lengkap!', { show_alert: true });
      await renderDashboard(ctx, effectiveChatId, lang, isPrivate, groupName);
    } else {
      await ctx.answerCbQuery('⚠️ Bot belum dijadikan Admin atau hak izin hapus pesan/batasi anggota belum aktif.', { show_alert: true });
    }
    return;
  }

  // Settings Page Switcher
  if (module === 'settings' && action === 'page') {
    await ctx.answerCbQuery();
    const pageNumber = parseInt(params[0], 10) || 1;
    let text = i18n.t(lang, 'settings.title', { group_name: groupName });
    if (isPrivate) text += `\n\n📍 <i>Mode private — perubahan berlaku untuk grup ini.</i>`;
    const keyboard = dashboardKeyboard(lang, isPrivate, pageNumber);

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
    await renderDashboard(ctx, effectiveChatId, lang, isPrivate, groupName);
    return;
  }

  // 6. Direct Settings Navigation (e.g. settings:media, settings:antispam)
  if (module === 'settings') {
    const targetModuleKey = action;
    const targetModule = settingsRegistry.get(targetModuleKey);

    if (targetModule) {
      await ctx.answerCbQuery();
      return targetModule.render(ctx, effectiveChatId);
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
