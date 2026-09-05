// Isolasi test: paksa file driver + db sementara (jangan sentuh bin JsonVault produksi).
// Harus sebelum require database karena dotenv tidak menimpa env yang sudah ada.
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

const { describe, it } = require('node:test');
const assert = require('node:assert');
const db = require('../src/database/database');

describe('Database Service Isolation & Operations', async () => {
  await db.init();

  it('should isolate group settings between Group A and Group B', () => {
    const groupA = '-100111';
    const groupB = '-100222';

    // Modify Group A: disable video
    const settingsA = db.getGroupSettings(groupA);
    settingsA.media.video = false;
    db.set('settings', groupA, settingsA, false);

    // Modify Group B: enable video
    const settingsB = db.getGroupSettings(groupB);
    settingsB.media.video = true;
    db.set('settings', groupB, settingsB, false);

    // Assert strictly isolated values
    const freshA = db.getGroupSettings(groupA);
    const freshB = db.getGroupSettings(groupB);

    assert.strictEqual(freshA.media.video, false);
    assert.strictEqual(freshB.media.video, true);
  });
});
