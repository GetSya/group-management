/**
 * Detects the media type of a Telegram message
 * @param {object} message Telegram Message object
 * @returns {string|null} Detected media type key or null if pure text/service
 */
function detectMediaType(message) {
  if (!message) return null;

  if (message.photo && message.photo.length > 0) return 'photo';
  if (message.video) return 'video';
  if (message.audio) return 'audio';
  if (message.voice) return 'voice';
  if (message.document) return 'document';
  if (message.sticker) return 'sticker';
  if (message.animation) return 'animation';
  if (message.contact) return 'contact';
  if (message.location) return 'location';
  if (message.venue) return 'venue';
  if (message.poll) return 'poll';
  if (message.dice) return 'dice';

  return null;
}

module.exports = {
  detectMediaType,
};
