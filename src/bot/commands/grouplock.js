const { isAdmin, checkBotPermissions } = require('../../utils/permissionUtils');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const privateSettingsService = require('../../services/privateSettingsService');
const { closeGroup, openGroup } = require('../../modules/groupLock');

function resolveTarget(ctx) {
  if (ctx.chat.type === 'private') {
    const selected = privateSettingsService.getSelectedGroup(String(ctx.from.id));
    if (!selected) {
      ctx.reply('⚠️ Pilih grup dulu via /settings di private chat.');
      return null;
    }
    return String(selected);
  }
  return String(ctx.chat.id);
}

function groupNameOf(targetId, ctx) {
  if (ctx.chat.type === 'private') {
    const g = (db.data.groups || {})[String(targetId)];
    return (g && g.title) || targetId;
  }
  return ctx.chat.title || targetId;
}

async function closeCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  const userId = String(ctx.from.id);
  const settings = db.getGroupSettings(target);
  const lang = settings.language || 'id';

  if (!(await isAdmin(ctx.telegram, target, userId))) {
    return ctx.reply(i18n.t(lang, 'common.only_admin'));
  }

  const perms = await checkBotPermissions(ctx.telegram, target);
  if (!perms.isAdmin || !perms.canRestrictMembers) {
    return ctx.reply(i18n.t(lang, 'grouplock.need_admin'), { parse_mode: 'HTML' });
  }

  const result = await closeGroup(ctx.telegram, target, userId);
  if (!result.ok) {
    return ctx.reply(`❌ Gagal menutup grup: <code>${result.error}</code>`, { parse_mode: 'HTML' });
  }
  return ctx.reply(`🔒 <b>${groupNameOf(target, ctx)} ditutup.</b>\n${i18n.t(lang, 'grouplock.closed_msg')}`, {
    parse_mode: 'HTML',
  });
}

async function openCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  const userId = String(ctx.from.id);
  const settings = db.getGroupSettings(target);
  const lang = settings.language || 'id';

  if (!(await isAdmin(ctx.telegram, target, userId))) {
    return ctx.reply(i18n.t(lang, 'common.only_admin'));
  }

  const perms = await checkBotPermissions(ctx.telegram, target);
  if (!perms.isAdmin || !perms.canRestrictMembers) {
    return ctx.reply(i18n.t(lang, 'grouplock.need_admin'), { parse_mode: 'HTML' });
  }

  const result = await openGroup(ctx.telegram, target, userId);
  if (!result.ok) {
    return ctx.reply(`❌ Gagal membuka grup: <code>${result.error}</code>`, { parse_mode: 'HTML' });
  }
  return ctx.reply(`🔓 <b>${groupNameOf(target, ctx)} dibuka.</b>\n${i18n.t(lang, 'grouplock.opened_msg')}`, {
    parse_mode: 'HTML',
  });
}

async function lockStatusCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  const userId = String(ctx.from.id);
  const settings = db.getGroupSettings(target);
  const lang = settings.language || 'id';

  if (!(await isAdmin(ctx.telegram, target, userId))) {
    return ctx.reply(i18n.t(lang, 'common.only_admin'));
  }

  // Sumber kebenaran live: permissions aktual di Telegram
  let liveClosed = null;
  try {
    const chat = await ctx.telegram.getChat(target);
    const perms = chat.permissions || {};
    if (typeof perms.can_send_messages === 'boolean') {
      liveClosed = perms.can_send_messages === false;
    }
  } catch {
    // fallback ke database bila API gagal
  }

  const lock = settings.groupLock || {};
  const isClosed = liveClosed !== null ? liveClosed : !!lock.isClosed;
  const status = isClosed ? `🔒 ${i18n.t(lang, 'grouplock.closed')}` : `🔓 ${i18n.t(lang, 'grouplock.opened')}`;
  const closedAt = lock.closedAt ? new Date(lock.closedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
  const closedBy = lock.closedBy ? `<code>${lock.closedBy}</code>` : '-';
  const liveNote = liveClosed !== null ? (isClosed ? '(live ✔)' : '(live ✔)') : '(db)';

  return ctx.reply(
    `📊 <b>Status Grup</b> ${liveNote}\n\nGrup: <b>${groupNameOf(target, ctx)}</b>\nStatus: <b>${status}</b>\nDitutup pada: ${closedAt}\nDitutup oleh: ${closedBy}`,
    { parse_mode: 'HTML' }
  );
}

module.exports = {
  closeCommand,
  openCommand,
  lockStatusCommand,
};
