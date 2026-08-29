const { Markup } = require('telegraf');
const BaseModule = require('../baseModule');
const db = require('../../database/database');

class AlphabetsModule extends BaseModule {
  constructor() {
    super('alphabets', 'Alphabets Filtering');
  }

  async render(ctx, chatId) {
    const settings = db.getGroupSettings(chatId);
    const alpha = settings.alphabets || { enabled: false, allowedScripts: ['LATIN'], action: 'delete' };
    const lang = settings.language || 'en';

    const text = this.t(lang, 'alphabets.title', {
      status: alpha.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled'),
      scripts: (alpha.allowedScripts || ['LATIN']).join(', '),
      action: (alpha.action || 'delete').toUpperCase(),
    });

    const scripts = ['LATIN', 'CYRILLIC', 'ARABIC', 'CHINESE', 'JAPANESE', 'KOREAN'];
    const scriptButtons = [];

    for (let i = 0; i < scripts.length; i += 2) {
      const s1 = scripts[i];
      const s2 = scripts[i + 1];
      const row = [];
      const active1 = (alpha.allowedScripts || []).includes(s1) ? '✅' : '❌';
      row.push(Markup.button.callback(`${s1} ${active1}`, `alphabets:script:${s1}`));
      if (s2) {
        const active2 = (alpha.allowedScripts || []).includes(s2) ? '✅' : '❌';
        row.push(Markup.button.callback(`${s2} ${active2}`, `alphabets:script:${s2}`));
      }
      scriptButtons.push(row);
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(this.t(lang, 'alphabets.toggle_btn'), 'alphabets:toggle'),
        Markup.button.callback(`⚡ Action: ${(alpha.action || 'delete').toUpperCase()}`, 'alphabets:action'),
      ],
      ...scriptButtons,
      [Markup.button.callback(this.t(lang, 'common.back'), 'settings:back')],
    ]);

    return this.safeEdit(ctx, text, keyboard);
  }

  async handleCallback(ctx, action, params) {
    const chatId = String(ctx.chat.id);
    const settings = db.getGroupSettings(chatId);
    const alpha = { ...settings.alphabets };

    if (action === 'toggle') {
      alpha.enabled = !alpha.enabled;
      await this.updateSettings(chatId, alpha);
      await ctx.answerCbQuery(`Alphabets filter ${alpha.enabled ? 'Enabled' : 'Disabled'}`);
    } else if (action === 'action') {
      const actions = ['delete', 'warn', 'mute'];
      const currentIndex = actions.indexOf(alpha.action || 'delete');
      alpha.action = actions[(currentIndex + 1) % actions.length];
      await this.updateSettings(chatId, alpha);
      await ctx.answerCbQuery(`Action: ${alpha.action.toUpperCase()}`);
    } else if (action === 'script') {
      const script = params[0];
      let currentScripts = alpha.allowedScripts || ['LATIN'];
      if (currentScripts.includes(script)) {
        currentScripts = currentScripts.filter(s => s !== script);
      } else {
        currentScripts.push(script);
      }
      alpha.allowedScripts = currentScripts;
      await this.updateSettings(chatId, alpha);
      await ctx.answerCbQuery(`${script} toggled`);
    }

    return this.render(ctx, chatId);
  }
}

module.exports = new AlphabetsModule();
