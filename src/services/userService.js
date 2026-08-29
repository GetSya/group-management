const db = require('../database/database');

class UserService {
  ensureUser(telegramUser) {
    return db.ensureUser(telegramUser);
  }

  getUser(userId) {
    return db.get('users', userId);
  }

  getAllUsers() {
    return db.get('users') || {};
  }
}

module.exports = new UserService();
