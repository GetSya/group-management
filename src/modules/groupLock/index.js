const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');
const logger = require('../../config/logger');

const PERMISSIONS_CLOSED = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  // Legacy fields for older Bot API servers
  can_send_media_messages: false,
};

const PERMISSIONS_OPEN = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_change_info: false,
  can_invite_users: true,
  can_pin_messages: false,
  // Legacy fields for older Bot API servers
  can_send_media_messages: true,
};

async function applyPermissions(telegram, chatId, permissions) {
  try {
    await telegram.setChatPermissions(chatId, permissions);
    return { ok: true };
  } catch (error) {
    logger.warn({ chatId, error: error.message }, 'Failed to set chat permissions');
    return { ok: false, error: error.message };
  }
}

async function closeGroup(telegram, chatId, closedBy = null) {
  const result = await applyPermissions(telegram, chatId, PERMISSIONS_CLOSED);
  if (result.ok) {
    await db.updateGroupSettings(
      chatId,
      'groupLock',
      { isClosed: true, closedAt: new Date().toISOString(), closedBy: closedBy ? String(closedBy) : null },
      true
    );
    try {
      await db.push(
        'logs',
        {
          id: `lock-${Date.now()}`,
          chatId: String(chatId),
          adminId: closedBy ? String(closedBy) : 'system',
          actionType: 'group_close',
          createdAt: new Date().toISOString(),
        },
        true
      );
    } catch {
      // audit log is best-effort
    }
  }
  return result;
}

async function openGroup(telegram, chatId, openedBy = null) {
  const result = await applyPermissions(telegram, chatId, PERMISSIONS_OPEN);
  if (result.ok) {
    await db.updateGroupSettings(
      chatId,
      'groupLock',
      { isClosed: false, openedAt: new Date().toISOString(), openedBy: openedBy ? String(openedBy) : null },
      true
    );
    try {
      await db.push(
        'logs',
        {
          id: `unlock-${Date.now()}`,
          chatId: String(chatId),
          adminId: openedBy ? String(openedBy) : 'system',
          actionType: 'group_open',
          createdAt: new Date().toISOString(),
        },
        true
      );
    } catch {
      // audit log is best-effort
    }
  }
  return result;
}

class GroupLockModule extends BaseModule {
  constructor() {
    super('groupLock', 'Group Open / Close');
  }

  getLockState(chatId) {
    const settings = db.getGroupSettings(String(chatId));
    return settings.groupLock || { isClosed: false, closedAt: null, closedBy: null };
  }

  async render(ctx, chatId) {
    const cid = String(chatId);
    const settings = db.getGroupSettings(cid);
    const lang = settings.language || 'en';
    const lock = this.getLockState(cid);
    const status = lock.isClosed ? `🔒 ${this.t(lang, 'grouplock.closed')}` : `🔓 ${this.t(lang, 'grouplock.opened')}`;

    const text = this.t(lang, 'grouplock.title', {
      status,
      closedAt: lock.closedAt ? new Date(lock.closedAt).toLocaleString() : '-',
      closedBy: lock.closedBy ? `<code>${lock.closedBy}</code>` : '-',
    });

    const toggleLabel = lock.isClosed ? this.t(lang, 'grouplock.open_btn') : this.t(lang, 'grouplock.close_btn');

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(toggleLabel, lock.isClosed ? 'groupLock:open' : 'groupLock:close'),
        Markup.button.callback(this.t(lang, 'grouplock.status_btn'), 'groupLock:status'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);

    if (action === 'close') {
      const result = await closeGroup(ctx.telegram, chatId, ctx.from?.id);
      await ctx.answerCbQuery(
        result.ok ? '🔒 Group closed' : `⚠️ Gagal menutup grup: ${result.error}`,
        { show_alert: !result.ok }
      );
      if (result.ok) {
        try {
          await ctx.reply('🔒 <b>Grup ditutup.</b>\nHanya admin yang dapat mengirim pesan.', { parse_mode: 'HTML' });
        } catch {
          // Ignored
        }
      }
      return this.render(ctx, chatId);
    }

    if (action === 'open') {
      const result = await openGroup(ctx.telegram, chatId, ctx.from?.id);
      await ctx.answerCbQuery(
        result.ok ? '🔓 Group opened' : `⚠️ Gagal membuka grup: ${result.error}`,
        { show_alert: !result.ok }
      );
      if (result.ok) {
        try {
          await ctx.reply('🔓 <b>Grup dibuka.</b>\nSemua anggota dapat mengirim pesan kembali.', { parse_mode: 'HTML' });
        } catch {
          // Ignored
        }
      }
      return this.render(ctx, chatId);
    }

    if (action === 'status') {
      const lock = this.getLockState(chatId);
      await ctx.answerCbQuery(lock.isClosed ? '🔒 Grup saat ini TERTUTUP' : '🔓 Grup saat ini TERBUKA');
      return this.render(ctx, chatId);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new GroupLockModule();
module.exports.closeGroup = closeGroup;
module.exports.openGroup = openGroup;
module.exports.PERMISSIONS_CLOSED = PERMISSIONS_CLOSED;
module.exports.PERMISSIONS_OPEN = PERMISSIONS_OPEN;
