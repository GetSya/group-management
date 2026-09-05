const { isAdmin } = require('../../utils/permissionUtils');
const db = require('../../database/database');
const privateSettingsService = require('../../services/privateSettingsService');
const { addWord, getWords } = require('../../modules/badword');

function resolveTarget(ctx) {
  if (ctx.chat.type === 'private') {
    const selected = privateSettingsService.getSelectedGroup(String(ctx.from.id));
    if (!selected) {
      ctx.reply('⚠️ Pilih grup dulu via /settings di private chat.');
      return null;
    }
    return String(selected);
  }
  return String(ctx.chat.id);
}

async function needAdmin(ctx, target) {
  if (!(await isAdmin(ctx.telegram, target, String(ctx.from.id)))) {
    await ctx.reply('❌ Hanya administrator grup yang dapat mengelola badword.');
    return false;
  }
  return true;
}

function parseWordArg(ctx) {
  return (ctx.message.text || '').split(/\s+/).slice(1).join(' ').trim();
}

/** /addbadword kata kasar */
async function addBadwordCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  if (!(await needAdmin(ctx, target))) return;
  const word = parseWordArg(ctx);
  if (!word) {
    return ctx.reply('⚠️ Pakai: <code>/addbadword kata</code>\nContoh: <code>/addbadword tolol</code>', { parse_mode: 'HTML' });
  }
  try {
    const entry = await addWord(target, word);
    return ctx.reply(`🔤 Kata <b>"${entry.value}"</b> ditambahkan ke daftar badword.`, { parse_mode: 'HTML' });
  } catch (e) {
    return ctx.reply(`❌ ${e.message}`, { parse_mode: 'HTML' });
  }
}

/** /delbadword kata */
async function delBadwordCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  if (!(await needAdmin(ctx, target))) return;
  const word = parseWordArg(ctx).toLowerCase();
  if (!word) {
    return ctx.reply('⚠️ Pakai: <code>/delbadword kata</code>', { parse_mode: 'HTML' });
  }
  const blocks = db.get('blocks') || [];
  const idx = blocks.findIndex(
    b => b.chatId === target && (b.type || '').toLowerCase() === 'word' && String(b.value).toLowerCase() === word
  );
  if (idx === -1) {
    return ctx.reply(`❌ "<code>${word}</code>" tidak ada di daftar. Lihat daftar via <code>/badwords</code>.`, { parse_mode: 'HTML' });
  }
  blocks.splice(idx, 1);
  db.queueWrite();
  return ctx.reply(`🗑 Kata <b>"${word}"</b> dihapus dari daftar badword.`, { parse_mode: 'HTML' });
}

/** /editbadword kata_lama | kata_baru */
async function editBadwordCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  if (!(await needAdmin(ctx, target))) return;
  const raw = parseWordArg(ctx);
  const [oldWord, newWord] = raw.split('|').map(s => (s || '').trim().toLowerCase());
  if (!oldWord || !newWord) {
    return ctx.reply('⚠️ Pakai: <code>/editbadword kata_lama | kata_baru</code>\nContoh: <code>/editbadword tolol | bodoh</code>', { parse_mode: 'HTML' });
  }
  if (newWord.length > 50) {
    return ctx.reply('❌ Kata baru maksimal 50 karakter.');
  }
  const blocks = db.get('blocks') || [];
  const entry = blocks.find(
    b => b.chatId === target && (b.type || '').toLowerCase() === 'word' && String(b.value).toLowerCase() === oldWord
  );
  if (!entry) {
    return ctx.reply(`❌ "<code>${oldWord}</code>" tidak ada di daftar.`, { parse_mode: 'HTML' });
  }
  if (blocks.some(b => b.id !== entry.id && b.chatId === target && (b.type || '').toLowerCase() === 'word' && String(b.value).toLowerCase() === newWord)) {
    return ctx.reply(`❌ "<code>${newWord}</code>" sudah ada di daftar.`, { parse_mode: 'HTML' });
  }
  entry.value = newWord;
  db.queueWrite();
  return ctx.reply(`✏️ <code>${oldWord}</code> → <b>${newWord}</b> diperbarui.`, { parse_mode: 'HTML' });
}

/** /badwords — daftar kata */
async function listBadwordsCommand(ctx) {
  const target = resolveTarget(ctx);
  if (!target) return;
  const words = getWords(target);
  if (words.length === 0) {
    return ctx.reply('🔤 Daftar badword masih kosong.\nTambah via <code>/addbadword kata</code> atau dashboard Blokir → Kelola Badword.', { parse_mode: 'HTML' });
  }
  const lines = words.map((w, i) => `${i + 1}. <code>${w.value}</code>`).join('\n');
  return ctx.reply(`🔤 <b>Daftar Badword (${words.length})</b>\n\n${lines}`, { parse_mode: 'HTML' });
}

module.exports = {
  addBadwordCommand,
  delBadwordCommand,
  editBadwordCommand,
  listBadwordsCommand,
};
