const { v4: uuidv4 } = require('uuid');
const db = require('../../database/database');

async function blockCommand(ctx) {
  const parts = ctx.message.text.split(' ').slice(1);
  const target = parts[0];

  if (!target) {
    return ctx.reply('⚠️ Usage: <code>/block @username</code> or reply to user message', { parse_mode: 'HTML' });
  }

  const cid = String(ctx.chat.id);
  const blockEntry = {
    id: uuidv4(),
    chatId: cid,
    type: target.startsWith('@') ? 'username' : 'user',
    value: target.toLowerCase(),
    action: 'delete',
    createdAt: new Date().toISOString(),
  };

  db.push('blocks', blockEntry, true);
  return ctx.reply(`🔐 Added <b>${target}</b> to group block list.`, { parse_mode: 'HTML' });
}

async function blockWordCommand(ctx) {
  const parts = ctx.message.text.split(' ').slice(1);
  const word = parts.join(' ').trim();

  if (!word) {
    return ctx.reply('⚠️ Usage: <code>/blockword offensiveWord</code>', { parse_mode: 'HTML' });
  }

  const cid = String(ctx.chat.id);
  const blockEntry = {
    id: uuidv4(),
    chatId: cid,
    type: 'word',
    value: word.toLowerCase(),
    action: 'delete',
    createdAt: new Date().toISOString(),
  };

  db.push('blocks', blockEntry, true);
  return ctx.reply(`🔐 Added keyword <b>"${word}"</b> to block list.`, { parse_mode: 'HTML' });
}

async function blockDomainCommand(ctx) {
  const parts = ctx.message.text.split(' ').slice(1);
  const domain = parts[0]?.trim();

  if (!domain) {
    return ctx.reply('⚠️ Usage: <code>/blockdomain spamlink.com</code>', { parse_mode: 'HTML' });
  }

  const cid = String(ctx.chat.id);
  const blockEntry = {
    id: uuidv4(),
    chatId: cid,
    type: 'domain',
    value: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''),
    action: 'delete',
    createdAt: new Date().toISOString(),
  };

  db.push('blocks', blockEntry, true);
  return ctx.reply(`🔐 Added domain <b>"${domain}"</b> to block list.`, { parse_mode: 'HTML' });
}

module.exports = {
  blockCommand,
  blockWordCommand,
  blockDomainCommand,
};
