/**
 * In-memory temporary input session manager for interactive admin configurations
 * Stores pending action states: chatId + userId -> { module, action, expiresAt }
 */
class SessionService {
  constructor() {
    this.sessions = new Map();
  }

  setSession(chatId, userId, sessionData, ttlSeconds = 120) {
    const key = `${chatId}:${userId}`;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.sessions.set(key, {
      ...sessionData,
      chatId: String(chatId),
      userId: String(userId),
      expiresAt,
    });
  }

  getSession(chatId, userId) {
    const key = `${chatId}:${userId}`;
    const session = this.sessions.get(key);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(key);
      return null;
    }
    return session;
  }

  clearSession(chatId, userId) {
    const key = `${chatId}:${userId}`;
    this.sessions.delete(key);
  }
}

module.exports = new SessionService();
