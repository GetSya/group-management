const { describe, it } = require('node:test');
const assert = require('node:assert');

const JsonVaultClient = require('../src/database/jsonVaultClient');

function mockFetch(responses) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    const next = responses.shift() || { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
    };
  };
  impl.calls = calls;
  return impl;
}

function clientWith(fetchImpl) {
  return new JsonVaultClient({
    baseUrl: 'https://jvault.aerialstudio.tech/',
    apiKey: 'jv_test_key',
    binId: 'test-bin-id',
    fetchImpl,
  });
}

describe('JsonVaultClient', () => {
  it('enabled=false bila key/bin kosong', () => {
    const c = new JsonVaultClient({ apiKey: '', binId: '' });
    assert.strictEqual(c.enabled, false);
  });

  it('read() GET bin dan kembalikan objek', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { groups: { a: 1 } } }]);
    const c = clientWith(fetchImpl);
    const data = await c.read();
    assert.deepStrictEqual(data, { groups: { a: 1 } });
    assert.ok(fetchImpl.calls[0].url.includes('bin_id=test-bin-id'));
    assert.strictEqual(fetchImpl.calls[0].method, 'GET');
  });

  it('read() melempar saat HTTP gagal', async () => {
    const fetchImpl = mockFetch([{ status: 500, body: 'boom' }]);
    const c = clientWith(fetchImpl);
    await assert.rejects(() => c.read(), /HTTP 500/);
  });

  it('replace() memakai PUT dan mengembalikan content', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { status: 'success', content: { a: 1 } } }]);
    const c = clientWith(fetchImpl);
    const out = await c.replace({ a: 1 });
    assert.deepStrictEqual(out, { a: 1 });
    assert.strictEqual(fetchImpl.calls[0].method, 'PUT');
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[0].body), { a: 1 });
  });

  it('replace() menolak data non-objek', async () => {
    const c = clientWith(mockFetch([]));
    await assert.rejects(() => c.replace([1, 2]));
    await assert.rejects(() => c.replace(null));
  });

  it('merge() mentolerir 500 kosong khas server (tulis tetap berhasil)', async () => {
    const fetchImpl = mockFetch([{ status: 500, body: '' }]);
    const c = clientWith(fetchImpl);
    const out = await c.merge({ a: 1 });
    assert.strictEqual(out.ok, true);
    assert.ok(fetchImpl.calls[0].url.includes('action=merge'));
  });

  it('setKey()/pushItem() memanggil action yang benar', async () => {
    const fetchImpl = mockFetch([
      { status: 200, body: { status: 'success' } },
      { status: 200, body: { status: 'success', count: 1 } },
    ]);
    const c = clientWith(fetchImpl);
    await c.setKey('groups.test', { id: 'test' });
    await c.pushItem('logs', { ev: 'x' });
    assert.ok(fetchImpl.calls[0].url.includes('action=set'));
    assert.ok(fetchImpl.calls[0].url.includes('key=groups.test'));
    assert.ok(fetchImpl.calls[1].url.includes('action=push'));
  });

  it('semua method melempar bila client tidak dikonfigurasi', async () => {
    const c = new JsonVaultClient({ apiKey: '', binId: '' });
    await assert.rejects(() => c.read());
    await assert.rejects(() => c.replace({}));
  });
});
