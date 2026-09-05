const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const cardService = require('../src/services/welcomeCardService');
const { renderCard, ordinal, resolveBackgroundBuffer, sendCardMessage, CARD_W, CARD_H } = cardService;

function pngDims(buf) {
  assert.strictEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function samplePhoto(color = '#ff0000', w = 200, h = 200) {
  const c = createCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#ffffff';
  x.fillRect(50, 50, 100, 100);
  return loadImage(c.toBuffer('image/png'));
}

function stubFetch(handler) {
  const orig = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = orig;
  };
}

describe('Welcome Card Service (canvas lokal)', () => {
  it('renderCard menghasilkan PNG 1000x400 untuk welcome & goodbye', () => {
    for (const type of ['welcome', 'goodbye']) {
      const png = renderCard({ type, username: 'John', groupName: 'Anime Club', memberCount: '150' });
      const { w, h } = pngDims(png);
      assert.strictEqual(w, CARD_W);
      assert.strictEqual(h, CARD_H);
      assert.ok(png.length > 10000);
    }
  });

  it('renderCard tahan nama panjang & tanpa foto (fallback inisial)', () => {
    const png = renderCard({
      type: 'welcome',
      username: 'A'.repeat(100),
      groupName: 'G'.repeat(100),
      memberCount: '1',
    });
    pngDims(png);
  });

  it('renderCard memakai foto avatar/background/guild bila tersedia', async () => {
    const [avatarImg, backgroundImg, guildIconImg] = await Promise.all([
      samplePhoto('#00aa00'),
      samplePhoto('#0000aa', 1200, 500),
      samplePhoto('#aa00aa', 100, 100),
    ]);
    const png = renderCard({
      type: 'welcome',
      username: 'John',
      groupName: 'Anime Club',
      memberCount: '150',
      avatarImg,
      backgroundImg,
      guildIconImg,
    });
    pngDims(png);
    assert.ok(png.length > 10000);
  });

  it('ordinal() Inggris benar', () => {
    assert.strictEqual(ordinal(1), '1ST');
    assert.strictEqual(ordinal(2), '2ND');
    assert.strictEqual(ordinal(3), '3RD');
    assert.strictEqual(ordinal(11), '11TH');
    assert.strictEqual(ordinal(12), '12TH');
    assert.strictEqual(ordinal(13), '13TH');
    assert.strictEqual(ordinal(21), '21ST');
    assert.strictEqual(ordinal(150), '150TH');
  });

  it('resolveBackgroundBuffer: file_id > URL > null', async () => {
    const tg = {
      getFileLink: async fileId => `https://files.example/${fileId}.jpg`,
    };
    const fileBuf = Buffer.alloc(128, 7);
    const urlBuf = Buffer.alloc(128, 9);
    const restore = stubFetch(async url =>
      String(url).includes('files.example')
        ? { ok: true, arrayBuffer: async () => fileBuf }
        : { ok: true, arrayBuffer: async () => urlBuf }
    );
    try {
      assert.deepStrictEqual(
        await resolveBackgroundBuffer(tg, { backgroundFileId: 'fid', backgroundUrl: 'https://x/bg.png' }),
        fileBuf
      );
      assert.deepStrictEqual(await resolveBackgroundBuffer(tg, { backgroundUrl: 'https://x/bg.png' }), urlBuf);
      assert.strictEqual(await resolveBackgroundBuffer(tg, {}), null);
    } finally {
      restore();
    }
  });

  it('sendCardMessage mengirim foto + caption', async () => {
    const sent = [];
    const tg = {
      getUserProfilePhotos: async () => ({ photos: [] }),
      getChat: async () => ({}),
      getChatMembersCount: async () => 150,
      sendPhoto: async (chatId, _photo, extra) => {
        sent.push({ chatId, extra });
        return { message_id: 7 };
      },
    };
    const msg = await sendCardMessage(tg, '-1001', 'welcome', {
      member: { id: 5, first_name: 'John' },
      groupTitle: 'Anime Club',
      caption: 'Hello!',
      cardCfg: {},
    });
    assert.strictEqual(msg.message_id, 7);
    assert.strictEqual(sent[0].chatId, '-1001');
    assert.strictEqual(sent[0].extra.caption, 'Hello!');
  });

  it('sendCardMessage return null bila kirim gagal (caller fallback teks)', async () => {
    const tg = {
      getUserProfilePhotos: async () => ({ photos: [] }),
      getChat: async () => ({}),
      getChatMembersCount: async () => 99,
      sendPhoto: async () => {
        throw new Error('bot diblokir');
      },
    };
    const msg = await sendCardMessage(tg, '-1001', 'goodbye', {
      member: { id: 5, first_name: 'Jo' },
      groupTitle: 'G',
      caption: 'Bye',
      cardCfg: {},
    });
    assert.strictEqual(msg, null);
  });
});
