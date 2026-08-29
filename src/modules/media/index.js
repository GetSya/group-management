const BaseModule = require('../baseModule');
const { getMediaKeyboard } = require('../../bot/keyboards/mediaKeyboard');
const { MEDIA_TYPES } = require('../../config/constants');
const db = require('../../database/database');

class MediaModule extends BaseModule {
  constructor() {
    super('media', 'Media Management');
  }

  async render(ctx, chatId) {
    const cid = String(chatId);
    const groupSettings = db.getGroupSettings(cid);
    const media = groupSettings.media || {};
    const lang = groupSettings.language || 'en';

    const text = this.t(lang, 'media.title');
    const keyboard = getMediaKeyboard(media, lang);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    const chatId = String(ctx.chat.id);
    const groupSettings = db.getGroupSettings(chatId);
    const media = { ...groupSettings.media };
    const lang = groupSettings.language || 'en';

    if (action === 'toggle') {
      const type = params[0];
      if (type && media[type] !== undefined) {
        media[type] = !media[type];
        await this.updateSettings(chatId, media);
        await ctx.answerCbQuery(`${type.toUpperCase()}: ${media[type] ? 'ALLOWED' : 'BLOCKED'}`);
      }
    } else if (action === 'allow_all') {
      for (const type of MEDIA_TYPES) {
        media[type] = true;
      }
      await this.updateSettings(chatId, media);
      await ctx.answerCbQuery('All media allowed');
    } else if (action === 'deny_all') {
      for (const type of MEDIA_TYPES) {
        media[type] = false;
      }
      await this.updateSettings(chatId, media);
      await ctx.answerCbQuery('All media blocked');
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new MediaModule();
