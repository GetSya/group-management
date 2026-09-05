// Isolasi test: paksa file driver + db sementara (jangan sentuh bin JsonVault produksi).
process.env.DB_DRIVER = 'file';
if (!process.env.DB_PATH) {
  const __fs = require('fs');
  const __os = require('os');
  const __path = require('path');
  process.env.DB_PATH = __path.join(
    __fs.mkdtempSync(__path.join(__os.tmpdir(), 'bot-db-test-')),
    'db.json'
  );
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const db = require('../src/database/database');
const backupService = require('../src/database/backup');
const { getEmptyDatabase } = require('../src/database/schema');

describe('Backup & Restore Service', async () => {
  let tmpDir;
  let origBackupDir;
  let origData;

  before(async () => {
    await db.init();
    origData = JSON.parse(JSON.stringify(db.data));
    origBackupDir = backupService.backupDir;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-backup-test-'));
    backupService.backupDir = tmpDir;
    // Matikan auto-send agar tidak butuh Telegram saat test
    backupService.bot = null;
  });

  after(async () => {
    db.data = origData;
    await db.queueWrite().catch(() => {});
    backupService.backupDir = origBackupDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('createBackup() membuat file db-*.json yang valid', async () => {
    const res = await backupService.createBackup(null, 'manual');
    assert.ok(res && res.filename.startsWith('db-') && res.filename.endsWith('.json'));
    const stat = await fs.stat(res.filePath);
    assert.ok(stat.size > 10);
  });

  it('listBackups() mengembalikan daftar + stats', async () => {
    const list = await backupService.listBackups();
    assert.ok(Array.isArray(list) && list.length >= 1);
    assert.ok(list[0].filename.endsWith('.json'));
    const stats = await backupService.getStats();
    assert.strictEqual(stats.total, list.length);
    assert.ok(stats.dbSize > 0);
  });

  it('restoreFromData() menolak data korup', async () => {
    await assert.rejects(() => backupService.restoreFromData({ bogus: true }, 'corrupt-test'));
  });

  it('restoreFromData() memulihkan snapshot valid (dengan safety backup)', async () => {
    const snapshot = getEmptyDatabase();
    snapshot.groups = { '-999': { id: '-999', chatId: '-999', title: 'RestoreTest' } };
    const ok = await backupService.restoreFromData(snapshot, 'test-snapshot');
    assert.strictEqual(ok, true);
    assert.strictEqual(db.data.groups['-999'].title, 'RestoreTest');
    // pre-restore safety backup harus ikut tercatat
    const list = await backupService.listBackups();
    assert.ok(list.length >= 2);
  });

  it('restoreFromFile() memulihkan file dari disk', async () => {
    const list = await backupService.listBackups();
    const target = list[list.length - 1];
    const ok = await backupService.restoreFromFile(target.filename);
    assert.strictEqual(ok, true);
  });

  it('deleteBackup() menghapus file', async () => {
    const list = await backupService.listBackups();
    const victim = list[list.length - 1].filename;
    const ok = await backupService.deleteBackup(victim);
    assert.strictEqual(ok, true);
    const afterList = await backupService.listBackups();
    assert.ok(!afterList.some(b => b.filename === victim));
  });

  it('perintah /backup & /restore terdaftar dan bisa di-require', () => {
    const { backupCommand, restoreCommand } = require('../src/bot/commands/backup');
    assert.strictEqual(typeof backupCommand, 'function');
    assert.strictEqual(typeof restoreCommand, 'function');
  });
});
