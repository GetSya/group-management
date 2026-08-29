const { parseCommandText } = require('./customCommandParser');
const customCommandService = require('./customCommandService');
const { RESERVED_COMMANDS } = require('./customCommandValidator');

async function handleCustomCommand(ctx) {
  if (!ctx.message || !ctx.message.text || !ctx.chat) {
    return false;
  }

  const botUsername = ctx.botInfo?.username || '';
  const parsed = parseCommandText(ctx.message.text, botUsername);

  if (!parsed.isCommand || !parsed.command) {
    return false;
  }

  // If it's a reserved built-in command, let built-in handler process it
  if (RESERVED_COMMANDS.includes(parsed.command)) {
    return false;
  }

  // Attempt to execute custom command
  const executed = await customCommandService.executeCommand(ctx, parsed.command, false);
  return executed;
}

module.exports = {
  handleCustomCommand,
};
