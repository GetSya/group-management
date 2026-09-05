const { isAdmin } = require('../../utils/permissionUtils');
const sessionService = require('../../services/sessionService');
const moderationService = require('../../services/moderationService');
const customCommandRepo = require('../../modules/customCommands/customCommandRepository');
const { handleCustomCommand } = require('../../modules/customCommands/customCommandHandler');
const {
  validateCommandName,
  validateResponse,
  validateButtonText,
  validateUrl,
} = require('../../modules/customCommands/customCommandValidator');
const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const logger = require('../../config/logger');

async function messageHandler(ctx) {
  if (!ctx.message || !ctx.chat) return;

  const chatId = String(ctx.chat.id);
  const from = ctx.from;
  if (!from) return;
  const userId = String(from.id);
  const text = ctx.message.text || '';

  // 1. Check if user is in an active session (e.g. typing new rules, custom command creation)
  const session = sessionService.getSession(chatId, userId);
  if (session) {
    // Handle /cancel for any session type
    if (text === '/cancel') {
      sessionService.clearSession(chatId, userId);
      return ctx.reply('❌ Action cancelled.');
    }

    // --- Backup sessions (handle both text and document) ---
    if (session.module === 'backup') {
      const backupService = require('../../database/backup');
      const env = require('../../config/env');

      if (session.action === 'set_interval') {
        if (!text) return ctx.reply('❌ Kirim angka 1-168 untuk interval jam. Contoh: 1');
        const val = parseInt(text.trim(), 10);
        if (isNaN(val) || val < 1 || val > 168) {
          return ctx.reply('❌ Interval tidak valid. Masukkan angka 1-168 (jam). Contoh: <code>1</code> atau <code>6</code>', { parse_mode: 'HTML' });
        }
        await backupService.saveConfig({ intervalHours: val });
        await backupService.restartScheduler();
        sessionService.clearSession(chatId, userId);
        const next = backupService.getConfig().nextBackupAt ? new Date(backupService.getConfig().nextBackupAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';
        return ctx.reply(`✅ Interval auto backup diatur ke <b>${val} jam</b>\nJadwal berikutnya: ${next}\nCron: <code>${backupService._buildCronExpression(val)}</code>`, { parse_mode: 'HTML' });
      }

      if (session.action === 'set_target') {
        if (!text) return ctx.reply('❌ Kirim @username atau ID. Contoh: @admin');
        const raw = text.trim();
        if (raw === '-' || raw.toLowerCase() === 'hapus' || raw.toLowerCase() === 'clear') {
          await backupService.saveConfig({ targetUsername: null, targetChatId: null });
          sessionService.clearSession(chatId, userId);
          return ctx.reply('✅ Target pengiriman backup dihapus. Auto backup tetap dibuat lokal.');
        }
        // Normalize: ensure @ prefix for username
        let username = null;
        let chatIdTarget = null;
        if (/^\d+$/.test(raw)) {
          chatIdTarget = raw;
          username = null;
        } else if (/^@?[a-zA-Z0-9_]{5,32}$/.test(raw.replace(/^@/, ''))) {
          username = raw.startsWith('@') ? raw : `@${raw}`;
          // Try to resolve chatId via getChat
          try {
            const chat = await ctx.telegram.getChat(username);
            chatIdTarget = String(chat.id);
          } catch (e) {
            // keep username, chatId will be resolved on send
            chatIdTarget = null;
          }
        } else {
          return ctx.reply('❌ Format tidak valid. Gunakan <code>@username</code> atau ID numerik.', { parse_mode: 'HTML' });
        }
        await backupService.saveConfig({ targetUsername: username, targetChatId: chatIdTarget });
        await backupService.restartScheduler();
        sessionService.clearSession(chatId, userId);
        return ctx.reply(`✅ Target diatur ke ${username || `<code>${chatIdTarget}</code>`}\nBackup otomatis akan dikirim ke tujuan ini setiap ${backupService.getConfig().intervalHours} jam.`, { parse_mode: 'HTML' });
      }

      if (session.action === 'await_restore_file') {
        // Expect document with .json
        const doc = ctx.message.document;
        if (!doc) {
          return ctx.reply('❌ Kirim file <b>.json</b> sebagai Document. Contoh: kirim file backup <code>db-*.json</code>.\nKirim /cancel untuk batal.', { parse_mode: 'HTML' });
        }
        if (!doc.file_name || !doc.file_name.endsWith('.json')) {
          return ctx.reply('❌ File harus berformat <code>.json</code>. Pilih file backup yang valid.', { parse_mode: 'HTML' });
        }
        if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
          return ctx.reply('❌ File terlalu besar (max 20MB).');
        }
        try {
          await ctx.reply('⏳ Mendownload dan memvalidasi backup...');
          const file = await ctx.telegram.getFile(doc.file_id);
          const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`Download failed: ${res.status}`);
          const jsonText = await res.text();
          const jsonData = JSON.parse(jsonText);
          await backupService.restoreFromData(jsonData, doc.file_name);
          sessionService.clearSession(chatId, userId);
          return ctx.reply(`✅ <b>Restore berhasil</b> dari <code>${doc.file_name}</code>\nDatabase telah dipulihkan. Backup sebelumnya diamankan.`, { parse_mode: 'HTML' });
        } catch (e) {
          logger.warn({ error: e.message }, 'Restore from upload failed');
          return ctx.reply(`❌ Restore gagal: ${e.message}\nPastikan file adalah backup db.json yang valid.`);
        }
      }
    }

    // --- Welcome / Goodbye custom background (photo, URL, atau reset) ---
    if (
      (session.module === 'welcome' || session.module === 'goodbye') &&
      session.action === 'edit_background'
    ) {
      const modKey = session.module;
      const groupSettings = db.getGroupSettings(chatId);
      const lang = groupSettings.language || 'en';

      const photoArr = ctx.message.photo;
      if (photoArr && photoArr.length > 0) {
        const fileId = photoArr[photoArr.length - 1].file_id;
        try {
          await ctx.telegram.getFileLink(fileId); // validasi file bisa diakses
        } catch {
          return ctx.reply(i18n.t(lang, `${modKey}.bg_invalid`));
        }
        groupSettings[modKey] = {
          ...groupSettings[modKey],
          backgroundFileId: fileId,
          backgroundUrl: null,
        };
        await db.set('settings', chatId, groupSettings, true);
        sessionService.clearSession(chatId, userId);
        return ctx.reply(i18n.t(lang, `${modKey}.bg_set_photo`), { parse_mode: 'HTML' });
      }

      if (text) {
        const raw = text.trim();
        if (raw === '-' || raw.toLowerCase() === 'default' || raw.toLowerCase() === 'reset') {
          groupSettings[modKey] = {
            ...groupSettings[modKey],
            backgroundFileId: null,
            backgroundUrl: null,
          };
          await db.set('settings', chatId, groupSettings, true);
          sessionService.clearSession(chatId, userId);
          return ctx.reply(i18n.t(lang, `${modKey}.bg_reset`), { parse_mode: 'HTML' });
        }
        if (/^https?:\/\/.+\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(raw)) {
          groupSettings[modKey] = {
            ...groupSettings[modKey],
            backgroundFileId: null,
            backgroundUrl: raw,
          };
          await db.set('settings', chatId, groupSettings, true);
          sessionService.clearSession(chatId, userId);
          return ctx.reply(i18n.t(lang, `${modKey}.bg_set_url`), { parse_mode: 'HTML' });
        }
        return ctx.reply(i18n.t(lang, `${modKey}.bg_invalid`), { parse_mode: 'HTML' });
      }

      return ctx.reply(i18n.t(lang, `${modKey}.bg_prompt`), { parse_mode: 'HTML' });
    }

    // Only proceed to text-based sessions if text exists
    if (!text) return;

    const settings = db.getGroupSettings(chatId);
    const lang = settings.language || 'en';

    // Regulation edit
    if (session.module === 'regulation' && session.action === 'edit_rules') {
      settings.regulation = {
        ...settings.regulation,
        rules: text,
      };
      await db.set('settings', chatId, settings, true);
      sessionService.clearSession(chatId, userId);
      return ctx.reply(i18n.t(lang, 'regulation.updated'));
    }

    // Welcome edit
    if (session.module === 'welcome' && session.action === 'edit_message') {
      settings.welcome = {
        ...settings.welcome,
        message: text,
      };
      await db.set('settings', chatId, settings, true);
      sessionService.clearSession(chatId, userId);
      return ctx.reply('✅ Welcome message updated successfully.');
    }

    // Goodbye edit
    if (session.module === 'goodbye' && session.action === 'edit_message') {
      settings.goodbye = {
        ...settings.goodbye,
        message: text,
      };
      await db.set('settings', chatId, settings, true);
      sessionService.clearSession(chatId, userId);
      return ctx.reply('✅ Goodbye message updated successfully.');
    }

    // --- Custom Commands Interactive Sessions ---
    if (session.module === 'customCommands') {
      if (session.action === 'add_name') {
        const validation = validateCommandName(text);
        if (!validation.valid) {
          return ctx.reply(`❌ ${validation.error}\nPlease try another name or send /cancel.`);
        }

        // Check duplicate
        const existing = customCommandRepo.findByName(chatId, validation.cleanName);
        if (existing) {
          return ctx.reply(`❌ Command /${validation.cleanName} already exists in this group.\nPlease send another name or send /cancel.`);
        }

        sessionService.setSession(
          chatId,
          userId,
          {
            module: 'customCommands',
            action: 'add_response',
            commandName: validation.cleanName,
          },
          300
        );

        return ctx.reply(
          `✅ Command name set to: <code>/${validation.cleanName}</code>\n\n📝 Now send the response message text for this command.\n\n<i>Available variables:</i> <code>{mention}</code>, <code>{user}</code>, <code>{username}</code>, <code>{group}</code>, <code>{user_id}</code>, <code>{date}</code>, <code>{time}</code>`,
          { parse_mode: 'HTML' }
        );
      }

      if (session.action === 'add_response') {
        const validation = validateResponse(text);
        if (!validation.valid) {
          return ctx.reply(`❌ ${validation.error}`);
        }

        const newCmd = customCommandRepo.create(chatId, {
          name: session.commandName,
          response: validation.cleanResponse,
          createdBy: userId,
        });

        sessionService.clearSession(chatId, userId);

        return ctx.reply(
          `🎉 <b>Custom command /${newCmd.name} created successfully!</b>\n\nTest it by sending: <code>/${newCmd.name}</code>\nManage buttons via <b>/settings ➔ Other ➔ Custom Commands</b>.`,
          { parse_mode: 'HTML' }
        );
      }

      if (session.action === 'add_button_text') {
        const validation = validateButtonText(text);
        if (!validation.valid) {
          return ctx.reply(`❌ ${validation.error}`);
        }

        sessionService.setSession(
          chatId,
          userId,
          {
            module: 'customCommands',
            action: 'add_button_target',
            commandName: session.commandName,
            buttonText: validation.cleanText,
          },
          300
        );

        return ctx.reply(
          `🔘 Button text: <b>"${validation.cleanText}"</b>\n\nNow send the button action:\n• Send a <b>URL</b> (e.g. <code>https://example.com</code>)\n• Send a <b>command</b> (e.g. <code>rules</code> or <code>/about</code>)\n• Send <code>text: Your direct response text</code>`,
          { parse_mode: 'HTML' }
        );
      }

      if (session.action === 'add_button_target') {
        const buttonText = session.buttonText;
        const cmdName = session.commandName;

        if (text.startsWith('http://') || text.startsWith('https://')) {
          const urlValidation = validateUrl(text);
          if (!urlValidation.valid) {
            return ctx.reply(`❌ ${urlValidation.error}`);
          }
          customCommandRepo.addButton(chatId, cmdName, {
            text: buttonText,
            type: 'url',
            url: urlValidation.cleanUrl,
          });
        } else if (text.toLowerCase().startsWith('text:')) {
          const directResponse = text.slice(5).trim();
          customCommandRepo.addButton(chatId, cmdName, {
            text: buttonText,
            type: 'response',
            response: directResponse,
          });
        } else {
          // Target command
          const targetCmd = text.replace(/^\//, '').trim().toLowerCase();
          customCommandRepo.addButton(chatId, cmdName, {
            text: buttonText,
            type: 'command',
            action: { command: targetCmd },
          });
        }

        sessionService.clearSession(chatId, userId);
        return ctx.reply(
          `✅ <b>Button added to /${cmdName}!</b>\nSend <code>/${cmdName}</code> to test it.`,
          { parse_mode: 'HTML' }
        );
      }

      if (session.action === 'edit_response') {
        const validation = validateResponse(text);
        if (!validation.valid) {
          return ctx.reply(`❌ ${validation.error}`);
        }

        const cmdName = session.commandName;
        customCommandRepo.update(chatId, cmdName, { response: validation.cleanResponse });
        sessionService.clearSession(chatId, userId);

        return ctx.reply(
          `✅ <b>Response updated for /${cmdName}!</b>\n\nTest it by sending: <code>/${cmdName}</code>`,
          { parse_mode: 'HTML' }
        );
      }
    }
  }

  // 2. Custom Commands Interception (checked before generic text moderation)
  const isCustomCommand = await handleCustomCommand(ctx);
  if (isCustomCommand) {
    return; // Command handled!
  }

  // 3. Admin Check - Administrators bypass regular group moderation
  const hasAdmin = await isAdmin(ctx.telegram, chatId, userId);
  if (hasAdmin) {
    return; // Allow admin message freely
  }

  // 4. Central Moderation Pipeline Execution for regular members
  await moderationService.processMessage(ctx);
}

module.exports = messageHandler;
