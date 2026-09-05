const fs = require('fs/promises');
const { Markup } = require('telegraf');
const backupService = require('../../database/backup');
const env = require('../../config/env');
const logger = require('../../config/logger');

function parseArgs(ctx) {
  const text = ctx.message?.text || ctx.message?.caption || '';
  return text.split(/\s+/).slice(1);
}

async function sendFileToCurrentChat(ctx, filePath, filename, caption) {
  const buf = await fs.readFile(filePath);
  return ctx.replyWithDocument({ source: buf, filename }, { caption, parse_mode: 'HTML' });
}

function formatList(all, limit = 10) {
  if (all.length === 0) return 'Belum ada backup. Gunakan <code>/backup</code> untuk membuat.';
  return all
    .slice(0, limit)
    .map((b, i) => {
      const date = new Date(b.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      return `${i + 1}. <code>${b.filename}</code>\n   📦 ${b.sizeFormatted} • ${date}`;
    })
    .join('\n');
}

function listKeyboard(all, limit = 10) {
  const rows = [];
  for (const b of all.slice(0, limit)) {
    rows.push([
      Markup.button.callback(`♻️ ${b.filename.slice(3, 15)}…`, `backup:restore:${b.filename}`),
      Markup.button.callback('🗑 Hapus', `backup:delete:${b.filename}`),
    ]);
  }
  rows.push([Markup.button.callback('💾 Backup Sekarang', 'backup:create')]);
  return Markup.inlineKeyboard(rows);
}

/**
 * /backup [create|list|info|send|export]
 * Default (tanpa argumen) = buat backup + kirim file ke chat ini.
 */
async function backupCommand(ctx) {
  const args = parseArgs(ctx);
  const sub = (args[0] || 'create').toLowerCase();

  if (sub === 'list') {
    const all = await backupService.listBackups();
    const text = `📂 <b>DAFTAR BACKUP (${all.length})</b>\n\n${formatList(all)}\n\nGunakan <code>/restore &lt;nama_file&gt;</code> atau tombol di bawah.\nLihat semua via <code>/settings</code> ➔ Other ➔ Backup & Restore.`;
    return ctx.reply(text, { parse_mode: 'HTML', ...listKeyboard(all) });
  }

  if (sub === 'info' || sub === 'status') {
    const cfg = backupService.getConfig();
    const stats = await backupService.getStats();
    const target = cfg.targetUsername || cfg.targetChatId || '<i>Belum diatur</i>';
    const last = cfg.lastBackupAt
      ? new Date(cfg.lastBackupAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
      : 'Belum pernah';
    const next = cfg.nextBackupAt
      ? new Date(cfg.nextBackupAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
      : '-';
    return ctx.reply(
      `💾 <b>STATUS BACKUP</b>\n\n⚙️ Auto: <b>${cfg.enabled ? 'Aktif' : 'Nonaktif'}</b>\n⏰ Interval: <b>${cfg.intervalHours} jam</b>\n📤 Target: ${target}\n📂 Total: <b>${stats.total} file</b>\n💿 Ukuran DB: <b>${stats.dbSizeFormatted}</b>\n🕐 Terakhir: ${last}\n⏭ Berikutnya: ${next}\n📁 Folder: <code>${backupService.backupDir}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  if (sub === 'send') {
    try {
      await ctx.reply('📨 Mengirim backup terbaru ke target terkonfigurasi...');
      await backupService.sendLatestToTarget(ctx.telegram);
      const cfg = backupService.getConfig();
      return ctx.reply(`✅ Backup terkirim ke ${cfg.targetUsername || cfg.targetChatId}`);
    } catch (e) {
      return ctx.reply(`❌ Gagal mengirim: ${e.message}\nAtur target via dashboard Backup ➔ Atur Target.`);
    }
  }

  if (sub === 'export') {
    try {
      const data = await backupService.exportCurrent();
      const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
      const filename = `db-export-${new Date().toISOString().slice(0, 10)}.json`;
      return ctx.replyWithDocument(
        { source: buf, filename },
        { caption: `📥 Export db.json • ${buf.length} bytes`, parse_mode: 'HTML' }
      );
    } catch (e) {
      return ctx.reply(`❌ Gagal export: ${e.message}`);
    }
  }

  if (sub === 'create' || sub === 'now' || sub === 'baru') {
    const wait = await ctx.reply('⏳ Membuat backup...');
    const res = await backupService.createBackup(null, 'manual');
    if (!res) return ctx.reply('❌ Gagal membuat backup. Cek log server.');
    try {
      await sendFileToCurrentChat(
        ctx,
        res.filePath,
        res.filename,
        `💾 Backup manual • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
      );
    } catch (e) {
      logger.warn({ error: e.message }, 'Failed to send backup file to current chat');
    }
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id);
    } catch {}
    return ctx.reply(`✅ Backup dibuat: <code>${res.filename}</code>`, { parse_mode: 'HTML' });
  }

  return ctx.reply(
    '💾 <b>Perintah Backup</b>\n\n<code>/backup</code> — buat + kirim file backup\n<code>/backup list</code> — daftar backup\n<code>/backup info</code> — status & jadwal\n<code>/backup send</code> — kirim terbaru ke target\n<code>/backup export</code> — export db tanpa simpan file',
    { parse_mode: 'HTML' }
  );
}

/**
 * /restore [nama_file]
 * Atau reply ke file .json dengan /restore.
 * Atau kirim file .json lalu reply dengan /restore.
 */
async function restoreCommand(ctx) {
  const args = parseArgs(ctx);
  const repliedDoc = ctx.message?.reply_to_message?.document;

  // 1. Restore dari file yang di-reply
  if (repliedDoc) {
    if (!repliedDoc.file_name || !repliedDoc.file_name.endsWith('.json')) {
      return ctx.reply('❌ File reply harus berformat <code>.json</code>.', { parse_mode: 'HTML' });
    }
    if (repliedDoc.file_size && repliedDoc.file_size > 20 * 1024 * 1024) {
      return ctx.reply('❌ File terlalu besar (max 20MB).');
    }
    try {
      await ctx.reply('⏳ Mendownload dan memvalidasi backup...');
      const file = await ctx.telegram.getFile(repliedDoc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Download gagal: HTTP ${res.status}`);
      const jsonData = JSON.parse(await res.text());
      await backupService.restoreFromData(jsonData, repliedDoc.file_name);
      logger.info({ file: repliedDoc.file_name, by: ctx.from?.id }, 'Backup restored via /restore reply');
      return ctx.reply(
        `✅ <b>Restore berhasil</b> dari <code>${repliedDoc.file_name}</code>\nBackup sebelumnya diamankan otomatis.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      logger.warn({ error: e.message }, 'Restore from reply failed');
      return ctx.reply(`❌ Restore gagal: ${e.message}`);
    }
  }

  // 2. Restore dari nama file lokal
  const filename = args[0];
  if (filename) {
    try {
      await ctx.reply(`⏳ Memulihkan dari <code>${filename}</code>...`, { parse_mode: 'HTML' });
      await backupService.restoreFromFile(filename);
      logger.info({ filename, by: ctx.from?.id }, 'Backup restored via /restore filename');
      return ctx.reply(
        `✅ <b>Restore berhasil</b> dari <code>${filename}</code>\nBackup sebelumnya diamankan otomatis.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      return ctx.reply(
        `❌ Restore gagal: ${e.message}\nGunakan <code>/backup list</code> untuk melihat nama file yang tersedia.`,
        { parse_mode: 'HTML' }
      );
    }
  }

  // 3. Tanpa argumen: tampilkan daftar + cara pakai
  const all = await backupService.listBackups();
  const text =
    `♻️ <b>RESTORE BACKUP</b>\n\n${formatList(all)}\n\n<b>Cara restore:</b>\n` +
    `1️⃣ <code>/restore &lt;nama_file&gt;</code>\n` +
    `2️⃣ Reply file <code>.json</code> dengan <code>/restore</code>\n` +
    `3️⃣ Via dashboard: <code>/settings</code> ➔ Other ➔ Backup & Restore\n\n⚠️ Restore menimpa seluruh db.json (backup otomatis dibuat dulu).`;
  if (all.length === 0) return ctx.reply(text, { parse_mode: 'HTML' });
  return ctx.reply(text, { parse_mode: 'HTML', ...listKeyboard(all) });
}

module.exports = {
  backupCommand,
  restoreCommand,
};
