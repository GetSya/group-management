const logger = require('../config/logger');

/**
 * Thin HTTP client untuk JsonVault (https://jvault.aerialstudio.tech).
 *
 * Endpoint yang dipakai (terverifikasi langsung terhadap API):
 * - GET    /api?bin_id=X                      -> baca seluruh isi bin
 * - PUT    /api?bin_id=X  (body: JSON penuh)   -> ganti SELURUH isi bin (200)
 * - PATCH  /api?bin_id=X&action=merge (body)   -> gabung parsial (server balas
 *   500 kosong padahal tulis BERHASIL, jadi jangan jadikan status satu-satunya
 *   acuan — verifikasi ulang dengan GET bila perlu)
 * - PATCH  /api?bin_id=X&action=set&key=a.b    -> set nested key (200)
 * - PATCH  /api?bin_id=X&action=push&key=logs  -> push item ke array (200)
 * - PATCH  /api?bin_id=X&action=remove&key=a   -> hapus key
 *
 * Semua method menerima `fetchImpl` agar mudah di-mock di unit test.
 */
class JsonVaultClient {
  constructor({ baseUrl, apiKey, binId, timeoutMs = 15000, fetchImpl = null } = {}) {
    this.baseUrl = String(baseUrl || 'https://jvault.aerialstudio.tech/').replace(/\/+$/, '') + '/';
    this.apiKey = apiKey || '';
    this.binId = binId || '';
    this.timeoutMs = timeoutMs;
    this._fetch = fetchImpl || fetch;
  }

  get enabled() {
    return Boolean(this.apiKey && this.binId);
  }

  _headers() {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  _url(query = '') {
    return `${this.baseUrl}api?bin_id=${encodeURIComponent(this.binId)}${query}`;
  }

  async _withTimeout(fn) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await fn(ctrl.signal);
    } finally {
      clearTimeout(t);
    }
  }

  _parseJsonSafe(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }

  /** Baca seluruh isi bin. Return objek (bisa `{}` bila bin kosong). */
  async read() {
    if (!this.enabled) throw new Error('JsonVault belum dikonfigurasi (API key / bin_id kosong)');
    const res = await this._withTimeout(signal =>
      this._fetch(this._url(), { headers: { 'X-API-Key': this.apiKey }, signal })
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`JsonVault GET gagal: HTTP ${res.status} ${text.slice(0, 200)}`);
    const data = this._parseJsonSafe(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    throw new Error('JsonVault GET: respons bukan objek JSON');
  }

  /**
   * Ganti SELURUH isi bin. Ini operasi utama sinkronisasi database bot.
   * Return `content` dari server (echo isi baru).
   */
  async replace(data) {
    if (!this.enabled) throw new Error('JsonVault belum dikonfigurasi (API key / bin_id kosong)');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JsonVault replace: data harus objek');
    }
    const res = await this._withTimeout(signal =>
      this._fetch(this._url(), {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify(data),
        signal,
      })
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`JsonVault PUT gagal: HTTP ${res.status} ${text.slice(0, 300)}`);
    const parsed = this._parseJsonSafe(text);
    return parsed && parsed.content !== undefined ? parsed.content : parsed;
  }

  /**
   * Gabung parsial (merge) ke isi bin.
   * CATATAN: server saat ini membalas 500 dengan body kosong padahal tulis
   * berhasil — jadi method ini TIDAK melempar pada 500 kosong, melainkan
   * mengembalikan `{ ok: true, verified: false }`. Panggil read() untuk verifikasi.
   */
  async merge(partial) {
    if (!this.enabled) throw new Error('JsonVault belum dikonfigurasi (API key / bin_id kosong)');
    const res = await this._withTimeout(signal =>
      this._fetch(this._url('&action=merge'), {
        method: 'PATCH',
        headers: this._headers(),
        body: JSON.stringify(partial),
        signal,
      })
    );
    const text = await res.text();
    if (res.ok) return this._parseJsonSafe(text);
    if (res.status === 500 && !text.trim()) {
      logger.warn('JsonVault merge membalas 500 kosong (tulis biasanya tetap berhasil). Verifikasi via GET.');
      return { ok: true, verified: false };
    }
    throw new Error(`JsonVault merge gagal: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  /** Set nested key dot-notation, mis. `groups.-100123`. */
  async setKey(keyPath, value) {
    if (!keyPath) throw new Error('JsonVault setKey: keyPath wajib diisi');
    const res = await this._withTimeout(signal =>
      this._fetch(this._url(`&action=set&key=${encodeURIComponent(keyPath)}`), {
        method: 'PATCH',
        headers: this._headers(),
        body: JSON.stringify(value),
        signal,
      })
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`JsonVault set gagal: HTTP ${res.status} ${text.slice(0, 300)}`);
    return this._parseJsonSafe(text);
  }

  /** Push satu item ke array pada keyPath, mis. `logs`. */
  async pushItem(keyPath, item) {
    if (!keyPath) throw new Error('JsonVault pushItem: keyPath wajib diisi');
    const res = await this._withTimeout(signal =>
      this._fetch(this._url(`&action=push&key=${encodeURIComponent(keyPath)}`), {
        method: 'PATCH',
        headers: this._headers(),
        body: JSON.stringify(item),
        signal,
      })
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`JsonVault push gagal: HTTP ${res.status} ${text.slice(0, 300)}`);
    return this._parseJsonSafe(text);
  }

  /** Hapus key. Server kadang balas 500 kosong saat berhasil (seperti merge). */
  async removeKey(keyPath) {
    if (!keyPath) throw new Error('JsonVault removeKey: keyPath wajib diisi');
    const res = await this._withTimeout(signal =>
      this._fetch(this._url(`&action=remove&key=${encodeURIComponent(keyPath)}`), {
        method: 'PATCH',
        headers: this._headers(),
        body: JSON.stringify({}),
        signal,
      })
    );
    const text = await res.text();
    if (res.ok) return this._parseJsonSafe(text);
    if (res.status === 500 && !text.trim()) {
      logger.warn('JsonVault remove membalas 500 kosong (tulis biasanya tetap berhasil).');
      return { ok: true, verified: false };
    }
    throw new Error(`JsonVault remove gagal: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

module.exports = JsonVaultClient;
