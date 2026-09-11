// Isolasi test: paksa file driver + db sementara (jangan sentuh bin JsonVault produksi).
process.env.DB_DRIVER = 'file';
if (!process.env.DB_PATH) {
  const __fs = require('fs');
  const __os = require('os');
  const __path = require('path');
  process.env.DB_PATH = __path.join(
    __fs.mkdtempSync(__path.join(__os.tmpdir(), 'bot-restore-test-')),
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
const JsonVaultClient = require('../src/database/jsonVaultClient');
const { getEmptyDatabase } = require('../src/database/schema');
const { downloadTelegramFile } = require('../src/utils/fileDownload');

function validSnapshot(title = 'RestoreTarget') {
  const s = getEmptyDatabase();
  s.groups = { '-998': { id: '-998', chatId: '-998', title } };
  return s;
}

describe('Restore tahan gagal remote (JsonVault)', async () => {
  let tmpDir;
  let origBackupDir;
  let origData;

  before(async () => {
    await db.init();
    origData = JSON.parse(JSON.stringify(db.data));
    origBackupDir = backupService.backupDir;
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bot-restore2-test-'));
    backupService.backupDir = tmpDir;
    backupService.bot = null;
  });

  after(async () => {
    db.driver = 'file';
    db.vault = null;
    db.data = origData;
    await db.queueWrite().catch(() => {});
    backupService.backupDir = origBackupDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('driver file: restoreFromData tetap return true (kontrak lama)', async () => {
    const ok = await backupService.restoreFromData(validSnapshot('FileOK'), 'compat-test');
    assert.strictEqual(ok, true);
    assert.strictEqual(db.data.groups['-998'].title, 'FileOK');
  });

  it('remote PUT gagal: restore tetap sukses lokal + flag remoteSyncFailed', async () => {
    const origDriver = db.driver;
    const origVault = db.vault;
    db.driver = 'jvault';
    db.vault = {
      // Simulasi server JsonVault tidak terjangkau (error mentah undici)
      replace: async () => {
        throw new TypeError('fetch failed');
      },
    };
    try {
      const res = await backupService.restoreFromData(validSnapshot('RemoteFail'), 'remote-fail-test');
      assert.ok(res && typeof res === 'object', 'harus object, bukan throw');
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.remoteSyncFailed, true);
      assert.match(res.remoteError, /fetch failed/);
      // Data memori + mirror lokal SUDAH dipulihkan walau remote gagal
      assert.strictEqual(db.data.groups['-998'].title, 'RemoteFail');
      const mirror = JSON.parse(await fs.readFile(db.dbPath, 'utf-8'));
      assert.strictEqual(mirror.groups['-998'].title, 'RemoteFail');
    } finally {
      db.driver = origDriver;
      db.vault = origVault;
    }
  });

  it('remoteSyncWarning: ada warning saat gagal remote, kosong saat sukses penuh', () => {
    const BackupService = backupService.constructor;
    assert.strictEqual(BackupService.remoteSyncWarning(true), '');
    assert.strictEqual(BackupService.remoteSyncWarning({ ok: true }), '');
    const w = BackupService.remoteSyncWarning({ ok: true, remoteSyncFailed: true, remoteError: 'fetch failed' });
    assert.match(w, /JsonVault gagal/);
    assert.match(w, /Jangan restart/);
  });
});

describe('JsonVaultClient network error dibungkus jelas', () => {
  function clientWith(fetchImpl) {
    return new JsonVaultClient({
      baseUrl: 'https://jvault.aerialstudio.tech/',
      apiKey: 'jv_test_key',
      binId: 'test-bin-id',
      fetchImpl,
    });
  }

  it('replace(): TypeError fetch failed -> pesan JsonVault PUT + sebab asli', async () => {
    const c = clientWith(async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(() => c.replace({ a: 1 }), /JsonVault PUT.*fetch failed/);
  });

  it('read(): AbortError -> pesan timeout', async () => {
    const c = clientWith(async () => {
      const e = new Error('This operation was aborted');
      e.name = 'AbortError';
      throw e;
    });
    await assert.rejects(() => c.read(), /timeout/);
  });
});

describe('downloadTelegramFile', () => {
  it('getFileLink gagal -> pesan jelas (bukan fetch failed mentah)', async () => {
    const telegram = {
      getFileLink: async () => {
        throw new Error('Bad Request: file not found');
      },
    };
    await assert.rejects(() => downloadTelegramFile(telegram, 'fid123'), /Tidak bisa mendapatkan link file/);
  });
});
