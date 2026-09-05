const { Markup } = require('telegraf');
const { v4: uuidv4 } = require('uuid');
const BaseModule = require('../baseModule');
const sessionService = require('../../services/sessionService');
const db = require('../../database/database');

const ACTIONS = ['delete', 'warn', 'mute', 'kick', 'ban'];
const PER_PAGE = 5;

function getWords(chatId) {
  const blocks = db.get('blocks') || [];
  return blocks.filter(b => b.chatId === String(chatId) && (b.type || '').toLowerCase() === 'word');
}

function getConfig(chatId) {
  const settings = db.getGroupSettings(String(chatId));
  return settings.badword || { enabled: true, action: 'delete' };
}

class BadwordModule extends BaseModule {
  constructor() {
    super('badword', 'Anti Badword');
  }

  async render(ctx, chatId) {
    return this.renderList(ctx, chatId, 1);
  }

  async renderList(ctx, chatId, page = 1) {
    const cid = String(chatId);
    const settings = db.getGroupSettings(cid);
    const lang = settings.language || 'en';
    const cfg = getConfig(cid);
    const words = getWords(cid);

    const totalPages = Math.max(1, Math.ceil(words.length / PER_PAGE));
    const p = Math.max(1, Math.min(totalPages, parseInt(page, 10) || 1));
    const slice = words.slice((p - 1) * PER_PAGE, p * PER_PAGE);

    const status = cfg.enabled ? '✅ ' + this.t(lang, 'common.enabled') : '❌ ' + this.t(lang, 'common.disabled');
    let text = this.t(lang, 'badword.title', {
      status,
      action: (cfg.action || 'delete').toUpperCase(),
      count: words.length,
    });

    if (words.length === 0) {
      text += `\n\n<i>${this.t(lang, 'badword.empty')}</i>`;
    } else {
      text += '\n';
      slice.forEach((w, i) => {
        const n = (p - 1) * PER_PAGE + i + 1;
        text += `\n${n}. <code>${String(w.value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;
      });
      if (totalPages > 1) text += `\n\n📄 Hal ${p}/${totalPages}`;
    }

    const rows = [
      [
        Markup.button.callback(this.t(lang, 'badword.toggle_btn'), 'badword:toggle'),
        Markup.button.callback(`${this.t(lang, 'badword.action_btn')}: ${(cfg.action || 'delete').toUpperCase()}`, 'badword:action'),
      ],
      [Markup.button.callback(this.t(lang, 'badword.add_btn'), 'badword:add')],
    ];

    for (const w of slice) {
      const label = String(w.value).slice(0, 24);
      rows.push([
        Markup.button.callback(`✏️ ${label}`, `badword:edit:${w.id}`),
        Markup.button.callback('🗑', `badword:del:${w.id}`),
      ]);
    }

    const nav = [];
    if (p > 1) nav.push(Markup.button.callback('⬅️ Prev', `badword:list:${p - 1}`));
    if (p < totalPages) nav.push(Markup.button.callback('Next ➡️', `badword:list:${p + 1}`));
    if (nav.length > 0) rows.push(nav);

    if (words.length > 0) {
      rows.push([Markup.button.callback(this.t(lang, 'badword.clear_btn'), 'badword:clear')]);
    }
    rows.push([Markup.button.callback(this.t(lang, 'common.back'), 'settings:blocks')]);

    return this.safeEdit(ctx, text, Markup.inlineKeyboard(rows));
  }

  async handleCallback(ctx, action, params) {
    const chatId = String(ctx.targetChatId || ctx.chat.id);
    const userId = String(ctx.from.id);

    if (action === 'list') {
      await ctx.answerCbQuery();
      return this.renderList(ctx, chatId, params[0] || '1');
    }

    if (action === 'toggle') {
      const cfg = { ...getConfig(chatId), enabled: !getConfig(chatId).enabled };
      await this.updateSettings(chatId, cfg);
      await ctx.answerCbQuery(`Anti Badword ${cfg.enabled ? 'Aktif' : 'Nonaktif'}`);
      return this.renderList(ctx, chatId, params[0] || '1');
    }

    if (action === 'action') {
      const cfg = getConfig(chatId);
      const next = ACTIONS[(ACTIONS.indexOf(cfg.action || 'delete') + 1) % ACTIONS.length];
      await this.updateSettings(chatId, { action: next });
      // Samakan action semua kata grup ini agar moderasi konsisten
      const blocks = db.get('blocks') || [];
      let changed = false;
      for (const b of blocks) {
        if (b.chatId === chatId && (b.type || '').toLowerCase() === 'word') {
          b.action = next;
          changed = true;
        }
      }
      if (changed) db.queueWrite();
      await ctx.answerCbQuery(`Tindakan: ${next.toUpperCase()}`);
      return this.renderList(ctx, chatId, params[0] || '1');
    }

    if (action === 'add') {
      sessionService.setSession(String(ctx.chat.id), userId, { targetChatId: chatId, module: 'badword', action: 'add_word' }, 180);
      await ctx.answerCbQuery();
      return ctx.reply(this.t(db.getGroupSettings(chatId).language || 'en', 'badword.add_prompt'), { parse_mode: 'HTML' });
    }

    if (action === 'edit') {
      const wordId = params[0];
      const word = getWords(chatId).find(w => w.id === wordId);
      if (!word) {
        await ctx.answerCbQuery('❌ Kata tidak ditemukan.', { show_alert: true });
        return this.renderList(ctx, chatId, 1);
      }
      sessionService.setSession(
        String(ctx.chat.id),
        userId,
        { targetChatId: chatId, module: 'badword', action: 'edit_word', wordId },
        180
      );
      await ctx.answerCbQuery();
      return ctx.reply(
        this.t(db.getGroupSettings(chatId).language || 'en', 'badword.edit_prompt', { word: word.value }),
        { parse_mode: 'HTML' }
      );
    }

    if (action === 'del') {
      const wordId = params[0];
      const blocks = db.get('blocks') || [];
      const idx = blocks.findIndex(b => b.id === wordId && b.chatId === chatId);
      if (idx === -1) {
        await ctx.answerCbQuery('❌ Kata tidak ditemukan.', { show_alert: true });
      } else {
        const [removed] = blocks.splice(idx, 1);
        db.queueWrite();
        await ctx.answerCbQuery(`🗑 "${String(removed.value).slice(0, 30)}" dihapus`);
      }
      return this.renderList(ctx, chatId, 1);
    }

    if (action === 'clear') {
      const blocks = db.get('blocks') || [];
      const remaining = blocks.filter(b => !(b.chatId === chatId && (b.type || '').toLowerCase() === 'word'));
      const cleared = blocks.length - remaining.length;
      blocks.length = 0;
      blocks.push(...remaining);
      db.queueWrite();
      await ctx.answerCbQuery(`🗑 ${cleared} kata dihapus`);
      return this.renderList(ctx, chatId, 1);
    }

    await ctx.answerCbQuery();
    return this.renderList(ctx, chatId, 1);
  }
}

const instance = new BadwordModule();

async function addWord(chatId, word, action = null) {
  const cid = String(chatId);
  const clean = String(word || '').trim().toLowerCase();
  if (!clean) throw new Error('Kata kosong.');
  if (clean.length > 50) throw new Error('Maksimal 50 karakter.');
  if (getWords(cid).some(w => String(w.value).toLowerCase() === clean)) {
    throw new Error(`"<code>${clean}</code>" sudah ada di daftar.`);
  }
  const entry = {
    id: uuidv4(),
    chatId: cid,
    type: 'word',
    value: clean,
    action: action || getConfig(cid).action || 'delete',
    createdAt: new Date().toISOString(),
  };
  await db.push('blocks', entry, true);
  return entry;
}

module.exports = instance;
module.exports.addWord = addWord;
module.exports.getWords = getWords;
module.exports.getConfig = getConfig;
