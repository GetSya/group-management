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
  if (session && text) {
    if (text === '/cancel') {
      sessionService.clearSession(chatId, userId);
      return ctx.reply('❌ Action cancelled.');
    }

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
