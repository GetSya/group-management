const db = require('../../database/database');
const i18n = require('../../services/i18nService');
const { getUserMention } = require('../../utils/messageUtils');

const tagAdminsCooldown = new Map();

async function tagAdminsCommand(ctx) {
  const cid = String(ctx.chat.id);
  const settings = db.getGroupSettings(cid);
  const tagConfig = settings.tag || { enabled: true, allowTagAdmins: true, cooldown: 120 };
  const lang = settings.language || 'en';

  if (!tagConfig.enabled || !tagConfig.allowTagAdmins) {
    return ctx.reply('⚠️ /tagadmins command is currently disabled in this group.');
  }

  const now = Date.now();
  const cooldownMs = (tagConfig.cooldown || 120) * 1000;
  const lastTag = tagAdminsCooldown.get(cid);

  if (lastTag && now - lastTag < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - lastTag)) / 1000);
    return ctx.reply(`⚠️ Cooldown active. Please wait ${remaining}s before tagging admins again.`);
  }

  tagAdminsCooldown.set(cid, now);

  try {
    const administrators = await ctx.telegram.getChatAdministrators(ctx.chat.id);
    const mentions = administrators
      .filter(a => !a.user.is_bot)
      .map(a => `<a href="tg://user?id=${a.user.id}">👤 ${a.user.first_name || 'Admin'}</a>`)
      .join(' ');

    const messageReason = ctx.message.text.split(' ').slice(1).join(' ') || 'Attention needed!';
    const callerMention = getUserMention(ctx.from, true);

    const alertText = `${i18n.t(lang, 'tag.tag_admins', {
      mention: callerMention,
      message: messageReason,
    })}\n\n${mentions}`;

    return ctx.reply(alertText, { parse_mode: 'HTML' });
  } catch (error) {
    return ctx.reply('⚠️ Could not retrieve administrator list.');
  }
}

module.exports = tagAdminsCommand;
