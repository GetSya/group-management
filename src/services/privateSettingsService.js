/**
 * Menyimpan pilihan grup target untuk pengaturan via private chat.
 * Key: userId -> { groupId, expiresAt }
 * TTL default 30 menit, diperpanjang setiap akses.
 */
class PrivateSettingsService {
  constructor(ttlSeconds = 1800) {
    this.selections = new Map();
    this.ttlSeconds = ttlSeconds;
  }

  setSelectedGroup(userId, groupId) {
    this.selections.set(String(userId), {
      groupId: String(groupId),
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    });
  }

  getSelectedGroup(userId) {
    const entry = this.selections.get(String(userId));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.selections.delete(String(userId));
      return null;
    }
    // perpanjang sesi tiap diakses
    entry.expiresAt = Date.now() + this.ttlSeconds * 1000;
    return entry.groupId;
  }

  clearSelectedGroup(userId) {
    this.selections.delete(String(userId));
  }
}

module.exports = new PrivateSettingsService();
