const MODERATION_ACTIONS = {
  NONE: 'none',
  DELETE: 'delete',
  WARN: 'warn',
  MUTE: 'mute',
  KICK: 'kick',
  BAN: 'ban',
  RESTRICT_ALL: 'restrict_all',
  RESTRICT_MEDIA: 'restrict_media',
};

const BLOCK_TYPES = {
  USER: 'user',
  USERNAME: 'username',
  WORD: 'word',
  PHRASE: 'phrase',
  DOMAIN: 'domain',
};

const CAPTCHA_TYPES = {
  BUTTON: 'button',
  MATH: 'math',
};

const MEDIA_TYPES = [
  'photo',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
  'animation',
  'contact',
  'location',
  'venue',
  'poll',
  'dice',
];

const SUPPORTED_LANGUAGES = ['en', 'id', 'ja', 'zh'];

module.exports = {
  MODERATION_ACTIONS,
  BLOCK_TYPES,
  CAPTCHA_TYPES,
  MEDIA_TYPES,
  SUPPORTED_LANGUAGES,
};
