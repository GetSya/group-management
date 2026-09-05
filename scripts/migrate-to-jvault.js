/**
 * One-off migrasi: db.json lokal -> bin JsonVault remote.
 *
 * Cara pakai:
 *   node scripts/migrate-to-jvault.js
 *
 * Membaca JVAULT_* dari .env, memvalidasi db.json lokal dengan
 * DatabaseSchema, PUT seluruh isi ke bin, lalu verifikasi via GET.
 */
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

const JsonVaultClient = require('../src/database/jsonVaultClient');
const { DatabaseSchema } = require('../src/database/schema');

async function main() {
  const baseUrl = process.env.JVAULT_BASE_URL || 'https://jvault.aerialstudio.tech/';
  const apiKey = process.env.JVAULT_API_KEY || '';
  const binId = process.env.JVAULT_BIN_ID || '';
  if (!apiKey || !binId) throw new Error('JVAULT_API_KEY / JVAULT_BIN_ID kosong di .env');

  const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || 'db.json');
  const raw = await fs.readFile(dbPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const validated = DatabaseSchema.safeParse(parsed);
  if (!validated.success) throw new Error('db.json lokal tidak valid: ' + JSON.stringify(validated.error.errors.slice(0, 3)));

  const client = new JsonVaultClient({ baseUrl, apiKey, binId });
  console.log(`PUT ${Object.keys(validated.data).length} top-level keys -> bin ${binId} ...`);
  await client.replace(validated.data);

  const back = await client.read();
  const keys = ['groups', 'settings', 'users', 'customCommands'];
  for (const k of keys) {
    const a = validated.data[k] ? Object.keys(validated.data[k]).length : 0;
    const b = back[k] ? Object.keys(back[k]).length : 0;
    console.log(`  ${k}: lokal=${a} remote=${b} ${a === b ? 'OK' : 'BEDA!'}`);
  }
  console.log('Migrasi selesai.');
}

main().catch(err => {
  console.error('MIGRASI GAGAL:', err.message);
  process.exit(1);
});
