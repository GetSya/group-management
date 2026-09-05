const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class BlocksModule extends BaseModule {
  constructor() {
    super('blocks', 'Blocks & Blacklist');
  }

  async render(ctx, chatId) {
    const cid = String(chatId);
    const settings = db.getGroupSettings(cid);
    const lang = settings.language || 'en';

    const blocks = db.get('blocks') || [];
    const groupBlocks = blocks.filter(b => b.chatId === cid);

    const text = this.t(lang, 'blocks.title', {
      count: groupBlocks.length,
    });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(this.t(lang, 'blocks.clear_btn'), 'blocks:clear')],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, _params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    if (action === 'clear') {
      const blocks = db.get('blocks') || [];
      const remaining = blocks.filter(b => b.chatId !== chatId);
      db.set('blocks', null, remaining, true);
      await ctx.answerCbQuery('All block rules for this group cleared.');
    }
    return this.render(ctx, chatId);
  }
}

module.exports = new BlocksModule();
