const { v4: uuidv4 } = require('uuid');
const db = require('../database/database');
const logger = require('../config/logger');
const i18n = require('./i18nService');
const { getUserMention } = require('../utils/messageUtils');

class ActionService {
  async deleteMessage(telegram, chatId, messageId) {
    if (!telegram || !chatId || !messageId) return false;
    try {
      await telegram.deleteMessage(chatId, messageId);
      return true;
    } catch (error) {
      // 400 Message to delete not found or already deleted is normal in high traffic
      if (!error.message?.includes('message to delete not found') && !error.message?.includes('message can\'t be deleted')) {
        logger.debug({ chatId, messageId, error: error.message }, 'Failed to delete message');
      }
      return false;
    }
  }

  async muteUser(telegram, chatId, userId, durationSeconds = 3600) {
    try {
      const untilDate = Math.floor(Date.now() / 1000) + durationSeconds;
      await telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: false,
          can_send_media_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
        },
        until_date: untilDate,
      });
      logger.info({ chatId, userId, durationSeconds }, 'User muted');
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to mute user');
      return false;
    }
  }

  async unmuteUser(telegram, chatId, userId) {
    try {
      await telegram.restrictChatMember(chatId, userId, {
        permissions: {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });
      logger.info({ chatId, userId }, 'User unmuted');
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to unmute user');
      return false;
    }
  }

  async kickUser(telegram, chatId, userId) {
    try {
      // Unban right after ban to achieve Telegram kick effect (allows rejoining via link)
      await telegram.banChatMember(chatId, userId);
      await telegram.unbanChatMember(chatId, userId);
      logger.info({ chatId, userId }, 'User kicked');
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to kick user');
      return false;
    }
  }

  async banUser(telegram, chatId, userId) {
    try {
      await telegram.banChatMember(chatId, userId);
      logger.info({ chatId, userId }, 'User banned');
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to ban user');
      return false;
    }
  }

  async unbanUser(telegram, chatId, userId) {
    try {
      await telegram.unbanChatMember(chatId, userId);
      logger.info({ chatId, userId }, 'User unbanned');
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to unban user');
      return false;
    }
  }

  async restrictUser(telegram, chatId, userId, permissions = {}, untilDate = 0) {
    try {
      await telegram.restrictChatMember(chatId, userId, {
        permissions,
        until_date: untilDate,
      });
      return true;
    } catch (error) {
      logger.warn({ chatId, userId, error: error.message }, 'Failed to restrict user');
      return false;
    }
  }

  async warnUser(telegram, chatId, user, moderator = null, reason = 'Rule infraction') {
    const cid = String(chatId);
    const uid = String(user.id);
    const settings = db.getGroupSettings(cid);
    const lang = settings.language || 'en';

    const warnConfig = settings.warns || { maxWarns: 3, action: 'mute', muteDuration: 86400 };
    const maxWarns = warnConfig.maxWarns || 3;

    // Find current warning count
    const warnings = db.get('warnings') || [];
    let userWarn = warnings.find(w => w.chatId === cid && w.userId === uid);

    if (!userWarn) {
      userWarn = {
        id: uuidv4(),
        chatId: cid,
        userId: uid,
        count: 1,
        updatedAt: new Date().toISOString(),
      };
      db.push('warnings', userWarn, true);
    } else {
      userWarn.count += 1;
      userWarn.updatedAt = new Date().toISOString();
      db.queueWrite();
    }

    // Record warning history
    const historyEntry = {
      id: uuidv4(),
      chatId: cid,
      userId: uid,
      moderatorId: moderator ? String(moderator.id) : 'system',
      reason,
      warnNumber: userWarn.count,
      createdAt: new Date().toISOString(),
    };
    db.push('warningHistory', historyEntry, true);

    const mention = getUserMention(user, true);

    if (userWarn.count >= maxWarns) {
      // Escalation limit reached!
      const action = warnConfig.action || 'mute';
      await this.executeAction(telegram, cid, user, action, `Reached max warnings (${maxWarns})`);

      // Reset count after maximum penalty applied
      userWarn.count = 0;
      db.queueWrite();

      try {
        await telegram.sendMessage(
          cid,
          i18n.t(lang, 'warns.limit_reached', {
            mention,
            max: maxWarns,
            action: action.toUpperCase(),
          }),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        logger.debug({ error: err.message }, 'Failed to send max warns alert');
      }

      return { count: maxWarns, maxWarns, actionTaken: action };
    } else {
      try {
        await telegram.sendMessage(
          cid,
          i18n.t(lang, 'warns.warned', {
            mention,
            count: userWarn.count,
            max: maxWarns,
            reason,
          }),
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        logger.debug({ error: err.message }, 'Failed to send warn notice');
      }

      return { count: userWarn.count, maxWarns, actionTaken: 'warned' };
    }
  }

  async resetWarns(chatId, userId) {
    const cid = String(chatId);
    const uid = String(userId);
    const warnings = db.get('warnings') || [];
    const index = warnings.findIndex(w => w.chatId === cid && w.userId === uid);
    if (index !== -1) {
      warnings.splice(index, 1);
      db.queueWrite();
      return true;
    }
    return false;
  }

  async executeAction(telegram, chatId, user, action = 'delete', reason = '', moderator = null) {
    const act = (action || 'delete').toLowerCase();
    const userId = user ? user.id : null;

    logger.info({ chatId, userId, action: act, reason }, 'Executing moderation action');

    switch (act) {
      case 'warn':
        if (user) {
          await this.warnUser(telegram, chatId, user, moderator, reason);
        }
        break;

      case 'mute':
        if (userId) {
          await this.muteUser(telegram, chatId, userId, 86400);
        }
        break;

      case 'kick':
        if (userId) {
          await this.kickUser(telegram, chatId, userId);
        }
        break;

      case 'ban':
        if (userId) {
          await this.banUser(telegram, chatId, userId);
        }
        break;

      case 'restrict_all':
        if (userId) {
          await this.restrictUser(telegram, chatId, userId, {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
          });
        }
        break;

      case 'delete':
      case 'none':
      default:
        break;
    }
  }
}

module.exports = new ActionService();
