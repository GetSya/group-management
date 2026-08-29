const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const customCommandRepo = require('./customCommandRepository');
const { handleCustomCommandCallback } = require('./customCommandCallback');

class CustomCommandsModule extends BaseModule {
  constructor() {
    super('customCommands', 'Custom Commands & Buttons');
  }

  async render(ctx, chatId) {
    const commands = customCommandRepo.findAll(chatId);

    const text = `📝 <b>CUSTOM COMMANDS & BUTTONS</b>\n\nActive Commands: <b>${commands.length}</b>\n\nCreate custom slash commands, rich formatting, dynamic variables, and interactive inline buttons for this group.`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Add Command', 'customcmd:add'),
        Markup.button.callback('📋 List Commands', 'customcmd:list'),
      ],
      [Markup.button.callback('⬅️ Back to Other', 'settings:other')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async renderList(ctx, chatId) {
    const commands = customCommandRepo.findAll(chatId);

    let text = `📋 <b>GROUP CUSTOM COMMANDS (${commands.length}):</b>\n\n`;
    if (commands.length === 0) {
      text += 'No custom commands created yet. Click <b>➕ Add Command</b> to create one.';
    } else {
      text += 'Click on any command below to edit settings, response, or buttons:';
    }

    const commandButtons = [];
    for (let i = 0; i < commands.length; i += 2) {
      const c1 = commands[i];
      const c2 = commands[i + 1];
      const row = [];
      const s1 = c1.enabled ? '✅' : '❌';
      row.push(Markup.button.callback(`/${c1.name} ${s1}`, `customcmd:view:${c1.name}`));
      if (c2) {
        const s2 = c2.enabled ? '✅' : '❌';
        row.push(Markup.button.callback(`/${c2.name} ${s2}`, `customcmd:view:${c2.name}`));
      }
      commandButtons.push(row);
    }

    const keyboard = Markup.inlineKeyboard([
      ...commandButtons,
      [
        Markup.button.callback('➕ Add Command', 'customcmd:add'),
        Markup.button.callback('⬅️ Back', 'customcmd:menu'),
      ],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async renderEdit(ctx, chatId, cmdName) {
    const cmd = customCommandRepo.findByName(chatId, cmdName);
    if (!cmd) {
      return this.renderList(ctx, chatId);
    }

    let buttonCount = 0;
    const buttonListRows = [];

    if (cmd.buttons && Array.isArray(cmd.buttons)) {
      cmd.buttons.forEach((row, rIdx) => {
        row.forEach(btn => {
          buttonCount += 1;
          buttonListRows.push([
            Markup.button.callback(`🔘 ${btn.text} (${btn.type})`, `customcmd:view:${cmd.name}`),
            Markup.button.callback(`🗑 Delete`, `customcmd:btn_del:${cmd.name}:${btn.id}`),
          ]);
        });
      });
    }

    const previewResponse = cmd.response.length > 200 ? cmd.response.slice(0, 197) + '...' : cmd.response;

    const text = `📝 <b>EDIT: /${cmd.name}</b>\n\nStatus: <b>${cmd.enabled ? '✅ Enabled' : '❌ Disabled'}</b>\nPermission: <b>${cmd.permission.toUpperCase()}</b>\nAliases: <b>${cmd.aliases?.length ? cmd.aliases.join(', ') : 'None'}</b>\nButtons: <b>${buttonCount}</b>\n\n<b>Response Preview:</b>\n<i>${previewResponse}</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(cmd.enabled ? '🔴 Disable' : '🟢 Enable', `customcmd:toggle:${cmd.name}`),
        Markup.button.callback(`👥 Perm: ${cmd.permission.toUpperCase()}`, `customcmd:perm:${cmd.name}`),
      ],
      [
        Markup.button.callback('➕ Add Button', `customcmd:btn_add:${cmd.name}`),
        Markup.button.callback('👁 Preview', `customcmd:preview:${cmd.name}`),
      ],
      ...buttonListRows,
      [
        Markup.button.callback('🗑 Delete Command', `customcmd:delete:${cmd.name}`),
        Markup.button.callback('⬅️ Back to List', 'customcmd:list'),
      ],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    return handleCustomCommandCallback(ctx, action, params);
  }
}

module.exports = new CustomCommandsModule();
