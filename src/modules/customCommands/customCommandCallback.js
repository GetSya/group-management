const { Markup } = require('telegraf');
const customCommandRepo = require('./customCommandRepository');
const customCommandService = require('./customCommandService');
const { buildCustomKeyboard } = require('./customCommandKeyboard');
const { isAdmin } = require('../../utils/permissionUtils');
const sessionService = require('../../services/sessionService');
const logger = require('../../config/logger');

async function handleCustomCommandCallback(ctx, action, params) {
  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);

  // 1. User Button Click Action (`customcmd:button:btnId`)
  if (action === 'button') {
    const buttonId = params[0];
    const match = customCommandService.findButtonById(chatId, buttonId);

    if (!match) {
      return ctx.answerCbQuery('❌ Button action no longer available.', { show_alert: true });
    }

    const { button, command } = match;

    // Check command permission
    const hasPermission = await customCommandService.checkPermission(ctx, command);
    if (!hasPermission) {
      return ctx.answerCbQuery('❌ You do not have permission to use this button.', { show_alert: true });
    }

    if (button.type === 'command' && button.action?.command) {
      return customCommandService.executeCommand(ctx, button.action.command, true);
    }

    if (button.type === 'response' && button.response) {
      await ctx.answerCbQuery();
      const rendered = customCommandService.interpolateVariables(button.response, ctx, 'HTML');
      return ctx.reply(rendered, { parse_mode: 'HTML' });
    }

    return ctx.answerCbQuery();
  }

  // 2. Admin UI Actions - Require Administrator privileges
  const hasAdmin = await isAdmin(ctx.telegram, chatId, userId);
  if (!hasAdmin) {
    return ctx.answerCbQuery('❌ Only group administrators can manage custom commands.', { show_alert: true });
  }

  const customModule = require('./index');

  if (action === 'menu' || action === 'back') {
    await ctx.answerCbQuery();
    return customModule.render(ctx, chatId);
  }

  if (action === 'list') {
    await ctx.answerCbQuery();
    return customModule.renderList(ctx, chatId);
  }

  if (action === 'add') {
    sessionService.setSession(chatId, userId, { module: 'customCommands', action: 'add_name' }, 180);
    await ctx.answerCbQuery();
    return ctx.reply('📝 Please send the command name (e.g. <code>rules</code> or <code>/info</code>):\nSend /cancel to abort.', { parse_mode: 'HTML' });
  }

  if (action === 'view') {
    const cmdName = params[0];
    await ctx.answerCbQuery();
    return customModule.renderEdit(ctx, chatId, cmdName);
  }

  if (action === 'toggle') {
    const cmdName = params[0];
    const updated = customCommandRepo.toggle(chatId, cmdName);
    await ctx.answerCbQuery(`Command /${cmdName} ${updated?.enabled ? 'Enabled' : 'Disabled'}`);
    return customModule.renderEdit(ctx, chatId, cmdName);
  }

  if (action === 'perm') {
    const cmdName = params[0];
    const cmd = customCommandRepo.findByName(chatId, cmdName);
    if (cmd) {
      const nextPerm = cmd.permission === 'everyone' ? 'admin' : 'everyone';
      customCommandRepo.update(chatId, cmdName, { permission: nextPerm });
      await ctx.answerCbQuery(`Permission set to: ${nextPerm.toUpperCase()}`);
    }
    return customModule.renderEdit(ctx, chatId, cmdName);
  }

  if (action === 'delete') {
    const cmdName = params[0];
    customCommandRepo.delete(chatId, cmdName);
    await ctx.answerCbQuery(`Command /${cmdName} deleted.`);
    return customModule.renderList(ctx, chatId);
  }

  if (action === 'preview') {
    const cmdName = params[0];
    const cmd = customCommandRepo.findByName(chatId, cmdName);
    if (!cmd) return ctx.answerCbQuery('Command not found.');

    await ctx.answerCbQuery();
    const rendered = customCommandService.interpolateVariables(cmd.response, ctx, cmd.parseMode || 'HTML');
    const keyboard = buildCustomKeyboard(cmd.buttons);

    return ctx.reply(`👁 <b>[PREVIEW] /${cmd.name}</b>\n\n${rendered}`, {
      parse_mode: cmd.parseMode || 'HTML',
      ...(keyboard ? keyboard : {}),
    });
  }

  if (action === 'btn_add') {
    const cmdName = params[0];
    sessionService.setSession(chatId, userId, { module: 'customCommands', action: 'add_button_text', commandName: cmdName }, 180);
    await ctx.answerCbQuery();
    return ctx.reply(`➕ <b>Add Button to /${cmdName}</b>\n\nPlease send the button label text (e.g. <code>🌐 Website</code> or <code>📜 Rules</code>):`, { parse_mode: 'HTML' });
  }

  if (action === 'btn_del') {
    const cmdName = params[0];
    const btnId = params[1];
    customCommandRepo.deleteButton(chatId, cmdName, btnId);
    await ctx.answerCbQuery('Button deleted.');
    return customModule.renderEdit(ctx, chatId, cmdName);
  }

  return ctx.answerCbQuery();
}

module.exports = {
  handleCustomCommandCallback,
};
