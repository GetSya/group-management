const logger = require('../config/logger');

/**
 * Download file Telegram via URL resmi dari Bot API (getFileLink),
 * dengan timeout + retry + batas ukuran.
 *
 * @param {object} telegram - ctx.telegram / bot.telegram (Telegraf)
 * @param {string} fileId - Telegram file_id
 * @param {object} opts - { maxBytes=20MB, timeoutMs=30000, retries=3 }
 * @returns {Promise<Buffer>}
 */
async function downloadTelegramFile(telegram, fileId, opts = {}) {
  const limit = opts.maxBytes || 20 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs || 30000;
  const retries = opts.retries ?? 3;

  // URL resmi dari Bot API (mendukung custom API root, tidak rakit manual)
  let fileUrl;
  try {
    const link = await telegram.getFileLink(fileId);
    fileUrl = typeof link === 'string' ? link : String(link?.href || link);
  } catch (e) {
    throw new Error(`Tidak bisa mendapatkan link file: ${e.message}`);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(fileUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const lenHeader = res.headers.get('content-length');
      if (lenHeader && parseInt(lenHeader, 10) > limit) {
        throw new Error(`File terlalu besar (${lenHeader} bytes, max ${limit})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > limit) {
        throw new Error(`File terlalu besar (${buf.length} bytes, max ${limit})`);
      }
      if (buf.length === 0) {
        throw new Error('File kosong (0 bytes)');
      }
      return buf;
    } catch (e) {
      lastError = e;
      const msg = e?.cause?.message || e.message;
      logger.warn({ attempt, retries, error: msg }, 'Download file Telegram gagal, retry...');
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  const cause = lastError?.cause?.message || lastError?.message || 'unknown';
  throw new Error(
    `Download file gagal setelah ${retries}x percobaan (${cause}). ` +
      'Cek koneksi server ke api.telegram.org lalu coba lagi.'
  );
}

module.exports = {
  downloadTelegramFile,
};
