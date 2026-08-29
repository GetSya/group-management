const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

const LANG_NAMES = {
  en: 'English 🇬🇧',
  id: 'Bahasa Indonesia 🇮🇩',
  ja: '日本語 🇯🇵',
  zh: '简体中文 🇨🇳',
};

class LangModule extends BaseModule {
  constructor() {
    super('lang', 'Language');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const lang = settings.language || 'id';

    const text = this.t(lang, 'lang.title');
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(`🇬🇧 English ${lang === 'en' ? '✅' : ''}`, 'lang:set:en'),
        Markup.button.callback(`🇮🇩 Indonesia ${lang === 'id' ? '✅' : ''}`, 'lang:set:id'),
      ],
      [
        Markup.button.callback(`🇯🇵 日本語 ${lang === 'ja' ? '✅' : ''}`, 'lang:set:ja'),
        Markup.button.callback(`🇨🇳 简体中文 ${lang === 'zh' ? '✅' : ''}`, 'lang:set:zh'),
      ],
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    const chatId = String(ctx.chat.id);
    if (action === 'set') {
      const selectedLang = params[0] || 'id';
      const settings = db.getGroupSettings(chatId);
      settings.language = selectedLang;
      await db.set('settings', chatId, settings, true);
      const displayName = LANG_NAMES[selectedLang] || selectedLang;
      await ctx.answerCbQuery(this.t(selectedLang, 'lang.selected', { lang: displayName }));
    }
    return this.render(ctx, chatId);
  }
}

module.exports = new LangModule();
