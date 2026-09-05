const { createCanvas, loadImage } = require('@napi-rs/canvas');
const logger = require('../config/logger');

const CARD_W = 1000;
const CARD_H = 400;
const FETCH_TIMEOUT_MS = 15000;
const ACCENTS = {
  welcome: { main: '#22c55e', deep: '#15803d', soft: 'rgba(34,197,94,', label: 'WELCOME' },
  goodbye: { main: '#f87171', deep: '#b91c1c', soft: 'rgba(248,113,113,', label: 'GOODBYE' },
};

function ordinal(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return `${n}`;
  const mod100 = num % 100;
  const mod10 = num % 10;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'TH' : mod10 === 1 ? 'ST' : mod10 === 2 ? 'ND' : mod10 === 3 ? 'RD' : 'TH';
  return `${num}${suffix}`;
}

function fitFont(ctx, text, maxWidth, baseSize, weight = 800, family = 'Arial, sans-serif') {
  let size = baseSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth || size <= 20) break;
    size -= 4;
  } while (size > 20);
  return size;
}

function spacedText(ctx, text, x, y, spacing = 6) {
  // letterSpacing tidak di semua build canvas — fallback manual.
  try {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
  } catch {
    ctx.fillText(text, x, y);
  }
}

async function fetchBuffer(url, fetchImpl = fetch) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new Error('Respons gambar kosong');
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function bufferToImage(buf) {
  try {
    return await loadImage(buf);
  } catch (err) {
    logger.debug({ error: err.message }, 'Buffer bukan gambar valid');
    return null;
  }
}

/** Gambar cover-fit ke area (x, y, w, h). */
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function circleClip(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
}

/** Bintang 4-sisi digambar manual (hindari tofu unicode di font sistem). */
function drawSparkle(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function withShadow(ctx, fn, color = 'rgba(0,0,0,0.55)', blur = 12, oy = 4) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = oy;
  fn();
  ctx.restore();
}

/** Background default: gradien navy + glow orbs + streak + pola titik + panel diagonal. */
function drawDefaultBackground(ctx, accent) {
  const base = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  base.addColorStop(0, '#0b1026');
  base.addColorStop(0.5, '#131b3a');
  base.addColorStop(1, '#070b1a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const orb = (cx, cy, r, alpha) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `${accent.soft}${alpha})`);
    g.addColorStop(1, `${accent.soft}0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  orb(830, 60, 260, 0.35);
  orb(140, 330, 220, 0.22);
  orb(520, 200, 300, 0.12);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(430, 0);
  ctx.lineTo(560, 0);
  ctx.lineTo(260, CARD_H);
  ctx.lineTo(130, CARD_H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.06;
  ctx.beginPath();
  ctx.moveTo(600, 0);
  ctx.lineTo(660, 0);
  ctx.lineTo(360, CARD_H);
  ctx.lineTo(300, CARD_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.beginPath();
      ctx.arc(36 + col * 26, 250 + row * 26, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  ctx.beginPath();
  ctx.moveTo(700, 0);
  ctx.lineTo(CARD_W, 0);
  ctx.lineTo(CARD_W, CARD_H);
  ctx.lineTo(560, CARD_H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent.main;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(700, 0);
  ctx.lineTo(560, CARD_H);
  ctx.stroke();
  ctx.restore();
}

/** Scrim gradien atas & bawah agar teks terbaca di atas foto custom. */
function drawScrims(ctx) {
  let top = ctx.createLinearGradient(0, 0, 0, 170);
  top.addColorStop(0, 'rgba(2,6,23,0.65)');
  top.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, 170);

  let bottom = ctx.createLinearGradient(0, 190, 0, CARD_H);
  bottom.addColorStop(0, 'rgba(2,6,23,0)');
  bottom.addColorStop(1, 'rgba(2,6,23,0.78)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 190, CARD_W, CARD_H - 190);
}

/** Watermark outline raksasa di belakang (kedalaman). */
function drawWatermark(ctx, label) {
  ctx.save();
  ctx.font = `800 128px Arial, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeText(label, 975, 175);
  ctx.restore();
}

/** Panel kaca di zona bawah untuk username + pill. */
function drawGlassPanel(ctx) {
  const x = 36;
  const y = 228;
  const w = 928;
  const h = 136;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(8,13,30,0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 1.5);
  ctx.lineTo(x + w - 24, y + 1.5);
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx, avatarImg, fallbackInitial, accent) {
  const cx = 158;
  const cy = 172;
  const r = 96;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(0.5, accent.main);
  ring.addColorStop(1, accent.deep);
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  circleClip(ctx, cx, cy, r);
  if (avatarImg) {
    drawCover(ctx, avatarImg, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#3b4a63');
    g.addColorStop(1, '#1c2438');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = `800 150px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((fallbackInitial || '?').toUpperCase(), cx, cy + 10);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 100px Arial, sans-serif`;
    ctx.fillText((fallbackInitial || '?').toUpperCase(), cx, cy + 6);
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = accent.main;
  ctx.strokeStyle = '#0b1220';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx + 68, cy + 64, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawGuildBadge(ctx, guildIconImg, groupName, accent) {
  const cx = 878;
  const cy = 100;
  const r = 54;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = accent.main;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  circleClip(ctx, cx, cy, r);
  if (guildIconImg) {
    drawCover(ctx, guildIconImg, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, accent.main);
    g.addColorStop(1, accent.deep);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#0b1220';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 56px Arial, sans-serif`;
    ctx.fillText((groupName || 'G').trim().charAt(0).toUpperCase() || 'G', cx, cy + 3);
  }
  ctx.restore();
}

/**
 * Render kartu PNG 1000x400 sepenuhnya lokal (tanpa API luar).
 * Semua gambar opsional — selalu ada fallback grafis. Semua teks ASCII
 * (simbol digambar manual sebagai path agar tidak tofu).
 */
function renderCard({ type = 'welcome', username = 'Member', groupName = 'Group', memberCount = '1', avatarImg = null, backgroundImg = null, guildIconImg = null }) {
  const accent = ACCENTS[type] || ACCENTS.welcome;
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  if (backgroundImg) {
    drawCover(ctx, backgroundImg, 0, 0, CARD_W, CARD_H);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    drawDefaultBackground(ctx, accent);
  }
  drawScrims(ctx);
  drawWatermark(ctx, accent.label);
  drawGlassPanel(ctx);

  // Bar aksen bawah
  const barGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  barGrad.addColorStop(0, accent.deep);
  barGrad.addColorStop(0.5, accent.main);
  barGrad.addColorStop(1, accent.deep);
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, CARD_H - 8, CARD_W, 8);

  drawAvatar(ctx, avatarImg, username.trim().charAt(0), accent);
  drawGuildBadge(ctx, guildIconImg, groupName, accent);

  const textX = 300;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Eyebrow + sparkle manual
  drawSparkle(ctx, textX + 2, 56, 11, accent.main);
  withShadow(ctx, () => {
    ctx.fillStyle = accent.main;
    ctx.font = `800 30px Arial, sans-serif`;
    spacedText(ctx, accent.label, textX + 24, 66, 6);
  });
  ctx.fillStyle = accent.main;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(textX + 24, 80, 76, 4);
  ctx.globalAlpha = 1;

  // Nama grup
  withShadow(ctx, () => {
    ctx.fillStyle = '#f1f5f9';
    fitFont(ctx, groupName, 470, 44);
    ctx.fillText(groupName, textX, 128);
  });

  // Username besar di dalam panel kaca
  withShadow(ctx, () => {
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, username, 600, 62);
    ctx.fillText(username, 66, 302);
  });

  // Pill member solid + sparkle manual
  const pillText = `${ordinal(memberCount)} MEMBER`;
  ctx.font = `800 24px Arial, sans-serif`;
  const pillTextW = ctx.measureText(pillText).width;
  const pillH = 40;
  const pillW = pillTextW + 78;
  const pillX = 66;
  const pillY = 322;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
  pillGrad.addColorStop(0, accent.main);
  pillGrad.addColorStop(1, accent.deep);
  ctx.fillStyle = pillGrad;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 20);
  ctx.fill();
  ctx.restore();
  drawSparkle(ctx, pillX + 30, pillY + pillH / 2, 9, '#06121f');
  ctx.fillStyle = '#06121f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(pillText, pillX + 48, pillY + 27);

  return canvas.toBuffer('image/png');
}

/** Download file Telegram (by file_id) -> buffer, atau null bila gagal. */
async function downloadTelegramFile(telegram, fileId) {
  try {
    const url = await telegram.getFileLink(fileId);
    return await fetchBuffer(url);
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal download file Telegram');
    return null;
  }
}

/** Avatar user -> buffer (null bila tidak ada foto). */
async function resolveAvatarBuffer(telegram, userId) {
  try {
    const photos = await telegram.getUserProfilePhotos(userId, 0, 1);
    const first = photos?.photos?.[0];
    if (first && first.length > 0) {
      const biggest = first[first.length - 1];
      return await downloadTelegramFile(telegram, biggest.file_id);
    }
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal resolve avatar, pakai inisial');
  }
  return null;
}

/** Foto grup -> buffer (null bila tidak ada). */
async function resolveGuildIconBuffer(telegram, chatId) {
  try {
    const chat = await telegram.getChat(chatId);
    const fileId = chat?.photo?.big_file_id || chat?.photo?.small_file_id;
    if (fileId) return await downloadTelegramFile(telegram, fileId);
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal resolve foto grup');
  }
  return null;
}

/**
 * Background: custom dari admin (file_id Telegram / URL) atau null (= default bot).
 * Sumber "dari users atau dari bot" — file_id di-resolve fresh setiap render.
 */
async function resolveBackgroundBuffer(telegram, cardCfg = {}) {
  try {
    if (cardCfg.backgroundFileId) {
      const buf = await downloadTelegramFile(telegram, cardCfg.backgroundFileId);
      if (buf) return buf;
    }
    if (cardCfg.backgroundUrl) {
      return await fetchBuffer(cardCfg.backgroundUrl);
    }
  } catch (err) {
    logger.debug({ error: err.message }, 'Gagal resolve background custom, pakai default');
  }
  return null;
}

async function resolveMemberCount(telegram, chatId, fallback = '1') {
  try {
    return String(await telegram.getChatMembersCount(chatId));
  } catch {
    return String(fallback);
  }
}

/**
 * Render + kirim sambutan/perpisahan sebagai FOTO kartu + caption.
 * Return message Telegram bila sukses, null bila gagal (caller kirim teks polos).
 */
async function sendCardMessage(telegram, chatId, type, { member, groupTitle, caption, cardCfg = {} }) {
  try {
    const fullName = [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'Member';
    const [avatarBuf, guildIconBuf, backgroundBuf, memberCount] = await Promise.all([
      member?.id ? resolveAvatarBuffer(telegram, member.id) : Promise.resolve(null),
      resolveGuildIconBuffer(telegram, chatId),
      resolveBackgroundBuffer(telegram, cardCfg),
      resolveMemberCount(telegram, chatId),
    ]);

    const [avatarImg, guildIconImg, backgroundImg] = await Promise.all([
      avatarBuf ? bufferToImage(avatarBuf) : null,
      guildIconBuf ? bufferToImage(guildIconBuf) : null,
      backgroundBuf ? bufferToImage(backgroundBuf) : null,
    ]);

    const png = renderCard({
      type,
      username: fullName.slice(0, 32),
      groupName: String(groupTitle || 'Group').slice(0, 32),
      memberCount,
      avatarImg,
      backgroundImg,
      guildIconImg,
    });

    return await telegram.sendPhoto(chatId, { source: png }, { caption: caption || '', parse_mode: 'HTML' });
  } catch (err) {
    logger.warn({ error: err.message, type }, 'Gagal render/kirim kartu, fallback ke teks');
    return null;
  }
}

module.exports = {
  CARD_W,
  CARD_H,
  ordinal,
  renderCard,
  fetchBuffer,
  bufferToImage,
  resolveAvatarBuffer,
  resolveGuildIconBuffer,
  resolveBackgroundBuffer,
  resolveMemberCount,
  sendCardMessage,
};
