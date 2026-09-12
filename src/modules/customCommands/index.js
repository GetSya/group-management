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

  async renderList(ctx, chatId, page = 1) {
    const commands = customCommandRepo.findAll(chatId);

    const COLS = 2;
    const ROWS = 4;
    const PER_PAGE = COLS * ROWS; // 8
    const totalPages = Math.max(1, Math.ceil(commands.length / PER_PAGE));
    const p = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const slice = commands.slice((p - 1) * PER_PAGE, p * PER_PAGE);

    let text = `📋 <b>GROUP CUSTOM COMMANDS (${commands.length}):</b>\n`;
    if (totalPages > 1) {
      text += `📄 Hal ${p}/${totalPages}\n`;
    }
    text += `\n`;
    if (commands.length === 0) {
      text += 'No custom commands created yet. Click <b>➕ Add Command</b> to create one.';
    } else {
      text += 'Click on any command below to edit settings, response, or buttons:';
    }

    const commandButtons = [];
    for (let i = 0; i < slice.length; i += COLS) {
      const c1 = slice[i];
      const c2 = slice[i + 1];
      const row = [];
      const s1 = c1.enabled ? '✅' : '❌';
      row.push(Markup.button.callback(`/${c1.name} ${s1}`, `customcmd:view:${c1.name}:${p}`));
      if (c2) {
        const s2 = c2.enabled ? '✅' : '❌';
        row.push(Markup.button.callback(`/${c2.name} ${s2}`, `customcmd:view:${c2.name}:${p}`));
      }
      commandButtons.push(row);
    }

    const navRow = [];
    if (p > 1) navRow.push(Markup.button.callback('⬅️ Prev', `customcmd:list:${p - 1}`));
    if (p < totalPages) navRow.push(Markup.button.callback('Next ➡️', `customcmd:list:${p + 1}`));

    const keyboard = Markup.inlineKeyboard([
      ...commandButtons,
      ...(navRow.length > 0 ? [navRow] : []),
      [
        Markup.button.callback('➕ Add Command', 'customcmd:add'),
        Markup.button.callback('⬅️ Back', 'customcmd:menu'),
      ],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async renderEdit(ctx, chatId, cmdName, returnPage = 1, btnPage = 1) {
    const cmd = customCommandRepo.findByName(chatId, cmdName);
    if (!cmd) {
      return this.renderList(ctx, chatId, returnPage);
    }

    const rp = Math.max(1, parseInt(returnPage, 10) || 1);
    const { flattenButtons, BUTTONS_PER_PAGE } = require('./customCommandKeyboard');
    const flatButtons = flattenButtons(cmd.buttons);
    const buttonCount = flatButtons.length;
    const totalBtnPages = Math.max(1, Math.ceil(buttonCount / BUTTONS_PER_PAGE));
    const bp = Math.max(1, Math.min(totalBtnPages, parseInt(btnPage, 10) || 1));
    const btnSlice = flatButtons.slice((bp - 1) * BUTTONS_PER_PAGE, bp * BUTTONS_PER_PAGE);

    const buttonListRows = [];
    for (const btn of btnSlice) {
      buttonListRows.push([
        Markup.button.callback(`🔘 ${btn.text} (${btn.type})`, `customcmd:view:${cmd.name}:${rp}:${bp}`),
        Markup.button.callback(`🗑 Delete`, `customcmd:btn_del:${cmd.name}:${btn.id}:${rp}:${bp}`),
      ]);
    }
    if (totalBtnPages > 1) {
      const btnNav = [];
      if (bp > 1) btnNav.push(Markup.button.callback('⬅️ Prev', `customcmd:btnpage:${cmd.name}:${rp}:${bp - 1}`));
      btnNav.push(Markup.button.callback(`📄 ${bp}/${totalBtnPages}`, `customcmd:btnpage:${cmd.name}:${rp}:${bp}`));
      if (bp < totalBtnPages) btnNav.push(Markup.button.callback('Next ➡️', `customcmd:btnpage:${cmd.name}:${rp}:${bp + 1}`));
      buttonListRows.push(btnNav);
    }

    // Use code-point aware truncation to avoid splitting surrogate pairs (e.g. fancy unicode, emoji)
    // which would produce lone surrogates and cause Telegram "can't parse entities" errors.
    const PREVIEW_LIMIT = 150;
    const codePoints = Array.from(cmd.response);
    const rawPreview = codePoints.length > PREVIEW_LIMIT ? codePoints.slice(0, PREVIEW_LIMIT - 3).join('') + '...' : cmd.response;
    // Escape the preview so any HTML in it renders as literal text, not broken tags
    const previewResponse = rawPreview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const text = `📝 <b>EDIT: /${cmd.name}</b>\n\nStatus: <b>${cmd.enabled ? '✅ Enabled' : '❌ Disabled'}</b>\nPermission: <b>${cmd.permission.toUpperCase()}</b>\nAliases: <b>${cmd.aliases?.length ? cmd.aliases.join(', ') : 'None'}</b>\nButtons: <b>${buttonCount}</b>\n\n<b>Response Preview:</b>\n<i>${previewResponse}</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(cmd.enabled ? '🔴 Disable' : '🟢 Enable', `customcmd:toggle:${cmd.name}:${rp}:${bp}`),
        Markup.button.callback(`👥 Perm: ${cmd.permission.toUpperCase()}`, `customcmd:perm:${cmd.name}:${rp}:${bp}`),
      ],
      [
        Markup.button.callback('✏️ Edit Response', `customcmd:edit_resp:${cmd.name}:${rp}:${bp}`),
        Markup.button.callback('👁 Preview', `customcmd:preview:${cmd.name}:${rp}:${bp}`),
      ],
      [
        Markup.button.callback('➕ Add Button', `customcmd:btn_add:${cmd.name}:${rp}:${bp}`),
      ],
      ...buttonListRows,
      [
        Markup.button.callback('🗑 Delete Command', `customcmd:delete:${cmd.name}:${rp}`),
        Markup.button.callback('⬅️ Back to List', `customcmd:list:${rp}`),
      ],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    return handleCustomCommandCallback(ctx, action, params);
  }
}

module.exports = new CustomCommandsModule();
