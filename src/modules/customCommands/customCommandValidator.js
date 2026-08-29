const RESERVED_COMMANDS = [
  'start',
  'help',
  'settings',
  'warn',
  'warns',
  'resetwarns',
  'block',
  'blockword',
  'blockdomain',
  'tagadmins',
];

const LIMITS = {
  MAX_COMMANDS_PER_GROUP: 100,
  MAX_ALIASES_PER_COMMAND: 10,
  MAX_BUTTONS_PER_COMMAND: 20,
  MAX_BUTTON_ROWS: 10,
  MAX_RESPONSE_LENGTH: 4000,
  MAX_BUTTON_TEXT_LENGTH: 64,
};

const COMMAND_NAME_REGEX = /^[a-zA-Z0-9_]{1,32}$/;
const SAFE_URL_REGEX = /^https?:\/\/[^\s$.?#].[^\s]*$/i;

function validateCommandName(name, allowOverrideBuiltIn = false) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Command name is required.' };
  }

  const cleanName = name.replace(/^\//, '').split('@')[0].trim().toLowerCase();

  if (!COMMAND_NAME_REGEX.test(cleanName)) {
    return {
      valid: false,
      error: 'Command name must only contain alphanumeric characters and underscores (1-32 chars).',
    };
  }

  if (!allowOverrideBuiltIn && RESERVED_COMMANDS.includes(cleanName)) {
    return {
      valid: false,
      error: `Command "/${cleanName}" is a reserved system command.`,
    };
  }

  return { valid: true, cleanName };
}

function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required.' };
  }

  const cleanUrl = url.trim();
  if (cleanUrl.toLowerCase().startsWith('javascript:')) {
    return { valid: false, error: 'JavaScript URL schemes are prohibited.' };
  }

  if (!SAFE_URL_REGEX.test(cleanUrl)) {
    return { valid: false, error: 'URL must start with http:// or https:// and be valid.' };
  }

  return { valid: true, cleanUrl };
}

function validateResponse(response) {
  if (!response || typeof response !== 'string') {
    return { valid: false, error: 'Response text is required.' };
  }

  if (response.length > LIMITS.MAX_RESPONSE_LENGTH) {
    return {
      valid: false,
      error: `Response exceeds maximum allowed length of ${LIMITS.MAX_RESPONSE_LENGTH} characters.`,
    };
  }

  return { valid: true, cleanResponse: response.trim() };
}

function validateButtonText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { valid: false, error: 'Button text is required.' };
  }

  if (text.trim().length > LIMITS.MAX_BUTTON_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Button text exceeds maximum length of ${LIMITS.MAX_BUTTON_TEXT_LENGTH} characters.`,
    };
  }

  return { valid: true, cleanText: text.trim() };
}

module.exports = {
  RESERVED_COMMANDS,
  LIMITS,
  validateCommandName,
  validateUrl,
  validateResponse,
  validateButtonText,
};
