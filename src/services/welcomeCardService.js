const logger = require('../config/logger');

const CARD_API_BASE = process.env.WELCOME_CARD_API || 'https://api.siputzx.my.id/api/canvas';

// Default publik bila foto user/grup/background custom tidak tersedia.
const DEFAULT_AVATAR = 'https://i.ibb.co/1s8T3sY/48f7ce63c7aa.jpg';
const DEFAULT_BACKGROUND = 'https://i.ibb.co/4YBNyvP/images-76.jpg';
const DEFAULT_GUILD_ICON = 'https://i.ibb.co/G5mJZxs/rin.jpg';
const CARD_QUALITY = 80;
const FETCH_TIMEOUT_MS = 15000;

/**
 * Bangun URL kartu canvas. Semua 6 parameter wajib oleh API
 * (username, guildName, guildIcon, memberCount, avatar, background).
 */
function buildCardUrl(type, { username, guildName, guildIcon, memberCount, avatar, background }) {
  const endpoint = type === 'goodbye' ? 'goodbyev1' : 'welcomev1';
  const params = new URLSearchParams({
    username: String(username || 'Member').slice(0, 32),
    guildName: String(guildName || 'Group').slice(0, 32),
    guildIcon: guildIcon || DEFAULT_GUILD_ICON,
    memberCount: String(memberCount ?? '1'),
    avatar: avatar || DEFAULT_AVATAR,
    background: background || DEFAULT_BACKGROUND,
    quality: String(CARD_QUALITY),
  });
  return `${CARD_API_BASE}/${endpoint}?${params.toString()}`;
}

async function fetchBuffer(url, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Card API HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Card API error: ${text.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) throw new Error('Card API mengembalikan gambar kosong');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

/** Ambil foto profil terbesar user -> URL publik (fallback default). */
async function resolveAvatarUrl(telegram, userId) {
  try {
    const photos = await telegram.getUserProfilePhotos(userId, 0, 1);
    const first = photos?.photos?.[0];
    if (first && first.length > 0) {
      const biggest = first[first.length - 1];
      return await telegram.getFileLink(biggest.file_id);
    }
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal resolve avatar user, pakai default');
  }
  return DEFAULT_AVATAR;
}

/** Ambil foto grup -> URL publik (fallback default). */
async function resolveGuildIconUrl(telegram, chatId) {
  try {
    const chat = await telegram.getChat(chatId);
    const fileId = chat?.photo?.big_file_id || chat?.photo?.small_file_id;
    if (fileId) return await telegram.getFileLink(fileId);
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal resolve foto grup, pakai default');
  }
  return DEFAULT_GUILD_ICON;
}

/**
 * Resolve background: custom dari admin (file_id Telegram -> link fresh,
 * karena link file Telegram kedaluwarsa ~1 jam) atau URL custom, atau default bot.
 */
async function resolveBackgroundUrl(telegram, cardCfg = {}) {
  if (cardCfg.backgroundUrl) return cardCfg.backgroundUrl;
  if (cardCfg.backgroundFileId) {
    try {
      return await telegram.getFileLink(cardCfg.backgroundFileId);
    } catch (err) {
      logger.debug({ error: err.message }, 'Gagal resolve background custom, pakai default');
    }
  }
  return DEFAULT_BACKGROUND;
}

async function resolveMemberCount(telegram, chatId, fallback = '1') {
  try {
    return String(await telegram.getChatMembersCount(chatId));
  } catch {
    return String(fallback);
  }
}

/**
 * Kirim sambutan/perpisahan sebagai FOTO kartu + caption.
 * Return message Telegram bila sukses, null bila gagal (caller kirim teks polos).
 */
async function sendCardMessage(telegram, chatId, type, { member, groupTitle, caption, cardCfg = {} }) {
  const fullName = [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
  const [avatarUrl, guildIconUrl, backgroundUrl, memberCount] = await Promise.all([
    resolveAvatarUrl(telegram, member?.id),
    resolveGuildIconUrl(telegram, chatId),
    resolveBackgroundUrl(telegram, cardCfg),
    resolveMemberCount(telegram, chatId),
  ]);

  const url = buildCardUrl(type, {
    username: fullName,
    guildName: groupTitle,
    guildIcon: guildIconUrl,
    memberCount,
    avatar: avatarUrl,
    background: backgroundUrl,
  });

  try {
    const image = await fetchBuffer(url);
    return await telegram.sendPhoto(
      chatId,
      { source: image },
      { caption: caption || '', parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.warn({ error: err.message, type }, 'Gagal buat/kirim kartu, fallback ke teks');
    return null;
  }
}

module.exports = {
  CARD_API_BASE,
  DEFAULT_AVATAR,
  DEFAULT_BACKGROUND,
  DEFAULT_GUILD_ICON,
  buildCardUrl,
  fetchBuffer,
  resolveAvatarUrl,
  resolveGuildIconUrl,
  resolveBackgroundUrl,
  resolveMemberCount,
  sendCardMessage,
};
