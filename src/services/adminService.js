const { v4: uuidv4 } = require('uuid');
const db = require('../database/database');
const { isAdmin, isOwner } = require('../utils/permissionUtils');

class AdminService {
  async isUserAdmin(telegram, chatId, userId) {
    return isAdmin(telegram, chatId, userId);
  }

  async isUserOwner(telegram, chatId, userId) {
    return isOwner(telegram, chatId, userId);
  }

  logAdminAction(chatId, adminId, actionType, targetId = null, details = null) {
    const logEntry = {
      id: uuidv4(),
      chatId: String(chatId),
      adminId: String(adminId),
      actionType,
      targetId: targetId ? String(targetId) : null,
      details,
      createdAt: new Date().toISOString(),
    };
    return db.push('logs', logEntry, false);
  }

  getLogs(chatId, limit = 20) {
    const cid = String(chatId);
    const logs = db.get('logs') || [];
    return logs
      .filter(l => l.chatId === cid)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }
}

module.exports = new AdminService();
