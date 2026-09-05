const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const backupService = require('../../database/backup');
const { isAdmin } = require('../../utils/permissionUtils');
const sessionService = require('../../services/sessionService');
const logger = require('../../config/logger');
const fs = require('fs/promises');
const path = require('path');

class BackupModule extends BaseModule {
  constructor() {
    super('backup', 'Backup & Restore');
  }

  async render(ctx, chatId) {
    const cfg = backupService.getConfig();
    const stats = await backupService.getStats();

    const enabledStr = cfg.enabled ? '✅ Aktif' : '❌ Nonaktif';
    const intervalStr = `${cfg.intervalHours} jam`;
    const targetStr = cfg.targetUsername ? `${cfg.targetUsername}${cfg.targetChatId ? ` (<code>${cfg.targetChatId}</code>)` : ''}` : (cfg.targetChatId ? `<code>${cfg.targetChatId}</code>` : '<i>Belum diatur</i>');
    const lastStr = cfg.lastBackupAt ? new Date(cfg.lastBackupAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : 'Belum pernah';
    const nextStr = cfg.nextBackupAt ? new Date(cfg.nextBackupAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
    const totalStr = `${stats.total} file`;
    const dbSizeStr = stats.dbSizeFormatted;

    const text = `💾 <b>BACKUP & RESTORE — db.json</b>\n\n` +
      `⚙️ <b>Auto Backup:</b> ${enabledStr}\n` +
      `⏰ <b>Interval:</b> ${intervalStr}\n` +
      `📤 <b>Kirim ke:</b> ${targetStr}\n` +
      `📂 <b>Total backup:</b> ${totalStr}\n` +
      `💿 <b>Ukuran DB:</b> ${dbSizeStr}\n` +
      `🕐 <b>Backup terakhir:</b> ${lastStr}\n` +
      `⏭ <b>Jadwal berikutnya:</b> ${nextStr}\n\n` +
      `Auto backup akan membuat file <code>db-*.json</code> di <code>${backupService.backupDir}</code> dan otomatis mengirim ke target jika diatur.\n` +
      `Gunakan interval custom (1-168 jam) dan atur username tujuan.`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(cfg.enabled ? '⏸ Nonaktifkan' : '▶️ Aktifkan', 'backup:toggle'),
        Markup.button.callback('⏰ Atur Interval', 'backup:set_interval'),
      ],
      [
        Markup.button.callback('📤 Atur Target', 'backup:set_target'),
        Markup.button.callback('📨 Kirim ke Target', 'backup:send_target'),
      ],
      [
        Markup.button.callback('💾 Backup Sekarang', 'backup:create'),
        Markup.button.callback('📂 Daftar Backup', 'backup:list:1'),
      ],
      [
        Markup.button.callback('📥 Export DB', 'backup:export'),
        Markup.button.callback('📤 Import / Restore', 'backup:import_prompt'),
      ],
      [
        Markup.button.callback('⬅️ Kembali', 'settings:other'),
      ],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async renderList(ctx, chatId, page = 1) {
    const all = await backupService.listBackups();
    const perPage = 4;
    const totalPages = Math.max(1, Math.ceil(all.length / perPage));
    const p = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const slice = all.slice((p - 1) * perPage, p * perPage);

    let text = `📂 <b>DAFTAR BACKUP (${all.length})</b> — Hal ${p}/${totalPages}\n\n`;
    if (all.length === 0) {
      text += 'Belum ada backup. Klik <b>💾 Backup Sekarang</b> untuk membuat.';
    } else {
      text += 'Klik Restore untuk memulihkan atau Hapus untuk menghapus:\n\n';
      slice.forEach((b, idx) => {
        const globalIdx = (p - 1) * perPage + idx + 1;
        const date = new Date(b.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        text += `${globalIdx}. <code>${b.filename}</code>\n   📦 ${b.sizeFormatted} • ${date}\n`;
      });
    }

    const rows = [];

    for (const b of slice) {
      // callback data limit 64 bytes -> filename ~30 chars fits
      rows.push([
        Markup.button.callback(`♻️ Restore ${b.filename.slice(0, 12)}…`, `backup:restore:${b.filename}`),
        Markup.button.callback(`🗑 Hapus`, `backup:delete:${b.filename}`),
      ]);
    }

    // pagination
    const navRow = [];
    if (p > 1) navRow.push(Markup.button.callback('⬅️ Prev', `backup:list:${p - 1}`));
    if (p < totalPages) navRow.push(Markup.button.callback('Next ➡️', `backup:list:${p + 1}`));
    if (navRow.length > 0) rows.push(navRow);

    rows.push([Markup.button.callback('💾 Backup Sekarang', 'backup:create')]);
    rows.push([Markup.button.callback('⬅️ Kembali', 'backup:menu')]);

    const keyboard = Markup.inlineKeyboard(rows);
    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const userId = String(ctx.from.id);

    // admin check (backup is sensitive -> require admin)
    const hasAdmin = await isAdmin(ctx.telegram, chatId, userId);
    if (!hasAdmin) {
      return ctx.answerCbQuery('❌ Hanya admin yang dapat mengelola backup.', { show_alert: true });
    }

    if (action === 'menu' || action === 'back') {
      await ctx.answerCbQuery();
      return this.render(ctx, chatId);
    }

    if (action === 'toggle') {
      const cfg = backupService.getConfig();
      await backupService.saveConfig({ enabled: !cfg.enabled });
      // restart scheduler
      await backupService.restartScheduler();
      await ctx.answerCbQuery(cfg.enabled ? 'Auto backup dinonaktifkan' : 'Auto backup diaktifkan');
      return this.render(ctx, chatId);
    }

    if (action === 'set_interval') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'backup', action: 'set_interval' }, 120);
      await ctx.answerCbQuery();
      return ctx.reply('⏰ <b>Atur Interval Auto Backup</b>\n\nKirim angka 1-168 (jam). Contoh: <code>1</code> = setiap jam, <code>6</code> = setiap 6 jam, <code>24</code> = harian.\nKirim /cancel untuk batal.', { parse_mode: 'HTML' });
    }

    if (action === 'set_target') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'backup', action: 'set_target' }, 120);
      await ctx.answerCbQuery();
      return ctx.reply('📤 <b>Atur Target Pengiriman Backup</b>\n\nKirim username atau ID tujuan:\n• <code>@username</code> (user harus sudah /start bot di private chat)\n• <code>123456789</code> (user ID / chat ID)\n• Kirim <code>-</code> untuk hapus target\n\nContoh: <code>@xiamostore</code> atau <code>1669925773</code>\nKirim /cancel untuk batal.', { parse_mode: 'HTML' });
    }

    if (action === 'send_target') {
      await ctx.answerCbQuery('Mengirim backup ke target...');
      try {
        const sent = await backupService.sendLatestToTarget(ctx.telegram);
        if (sent) return ctx.reply(`✅ Backup berhasil dikirim ke ${backupService.getConfig().targetUsername || backupService.getConfig().targetChatId}`);
        return ctx.reply('❌ Gagal mengirim backup. Periksa target sudah benar dan bot sudah di-start oleh user target.');
      } catch (e) {
        return ctx.reply(`❌ Gagal mengirim: ${e.message}\nPastikan target sudah /start bot dan username valid.`);
      }
    }

    if (action === 'create') {
      await ctx.answerCbQuery('Membuat backup...');
      const res = await backupService.createBackup(null, 'manual');
      if (res) {
        await ctx.answerCbQuery(`Backup dibuat: ${res.filename}`);
        // also offer to send as document to current chat
        try {
          await ctx.telegram.sendDocument(chatId, { source: await fs.readFile(res.filePath), filename: res.filename }, { caption: `💾 Backup manual • ${new Date().toLocaleString('id-ID')}` });
        } catch {}
      } else {
        await ctx.answerCbQuery('Gagal membuat backup', { show_alert: true });
      }
      return this.render(ctx, chatId);
    }

    if (action === 'list') {
      const page = params[0] || '1';
      await ctx.answerCbQuery();
      return this.renderList(ctx, chatId, page);
    }

    if (action === 'export') {
      await ctx.answerCbQuery('Menyiapkan export...');
      try {
        const data = await backupService.exportCurrent();
        const buf = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
        const filename = `db-export-${new Date().toISOString().slice(0,10)}.json`;
        await ctx.telegram.sendDocument(chatId, { source: buf, filename }, { caption: `📥 Export db.json • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} • ${buf.length} bytes` });
        await ctx.answerCbQuery('Export dikirim');
      } catch (e) {
        await ctx.answerCbQuery(`Gagal export: ${e.message}`, { show_alert: true });
      }
      return;
    }

    if (action === 'import_prompt') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'backup', action: 'await_restore_file' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply('📤 <b>Import / Restore dari File</b>\n\nKirim file <code>.json</code> backup sebagai <b>Document</b> (bukan text).\nBot akan validasi dan restore (backup saat ini akan diamankan dulu).\n\nKirim /cancel untuk batal.', { parse_mode: 'HTML' });
    }

    if (action === 'restore') {
      const filename = params[0];
      if (!filename) return ctx.answerCbQuery('File tidak ditemukan', { show_alert: true });
      // Confirm dialog
      await ctx.answerCbQuery();
      const text = `⚠️ <b>Konfirmasi Restore</b>\n\nFile: <code>${filename}</code>\n\nRestore akan menimpa <b>seluruh db.json saat ini</b> (backup otomatis dibuat sebelum restore). Lanjutkan?`;
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Ya, Restore', `backup:confirm_restore:${filename}`),
          Markup.button.callback('❌ Batal', 'backup:list:1'),
        ],
      ]);
      return this.safeEdit(ctx, text, keyboard);
    }

    if (action === 'confirm_restore') {
      const filename = params[0];
      await ctx.answerCbQuery('Memulihkan...');
      try {
        await backupService.restoreFromFile(filename);
        await ctx.reply(`✅ <b>Restore berhasil</b> dari <code>${filename}</code>\nDatabase telah dipulihkan.`, { parse_mode: 'HTML' });
        logger.info({ filename, by: userId }, 'Backup restored via Telegram');
      } catch (e) {
        await ctx.reply(`❌ Restore gagal: ${e.message}`);
        logger.warn({ error: e.message, filename }, 'Restore failed');
      }
      return this.render(ctx, chatId);
    }

    if (action === 'delete') {
      const filename = params[0];
      await ctx.answerCbQuery();
      const text = `🗑 <b>Hapus Backup?</b>\n\nFile: <code>${filename}</code>\nTindakan tidak dapat dibatalkan.`;
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Hapus', `backup:confirm_delete:${filename}`),
          Markup.button.callback('❌ Batal', 'backup:list:1'),
        ],
      ]);
      return this.safeEdit(ctx, text, keyboard);
    }

    if (action === 'confirm_delete') {
      const filename = params[0];
      const ok = await backupService.deleteBackup(filename);
      await ctx.answerCbQuery(ok ? 'Backup dihapus' : 'Gagal menghapus', { show_alert: !ok });
      return this.renderList(ctx, chatId, 1);
    }

    return ctx.answerCbQuery();
  }
}

module.exports = new BackupModule();
