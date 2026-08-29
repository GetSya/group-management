/**
 * Parses incoming message text to extract custom command name
 * Handles /command, /command@BotName, or command
 */
function parseCommandText(text, botUsername = '') {
  if (!text || typeof text !== 'string') {
    return { isCommand: false, command: '', raw: '' };
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('/') && !trimmed.startsWith('!')) {
    return { isCommand: false, command: '', raw: trimmed };
  }

  const firstToken = trimmed.split(/\s+/)[0];
  const cleanToken = firstToken.replace(/^[\/!]/, '');
  const [cmdName, targetBot] = cleanToken.split('@');

  // If targeted at a specific bot, ensure it matches this bot
  if (targetBot && botUsername && targetBot.toLowerCase() !== botUsername.toLowerCase()) {
    return { isCommand: false, command: '', raw: trimmed };
  }

  return {
    isCommand: true,
    command: cmdName.toLowerCase(),
    raw: trimmed,
  };
}

module.exports = {
  parseCommandText,
};
