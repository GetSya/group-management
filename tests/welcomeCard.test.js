const { describe, it } = require('node:test');
const assert = require('node:assert');

const cardService = require('../src/services/welcomeCardService');
const { buildCardUrl, sendCardMessage, resolveBackgroundUrl } = cardService;

function mockTelegram(overrides = {}) {
  return {
    getUserProfilePhotos: async () => ({ photos: [[{ file_id: 'small' }, { file_id: 'big' }]] }),
    getChat: async () => ({ photo: { big_file_id: 'chatbig' } }),
    getFileLink: async fileId => `https://files.example/${fileId}.jpg`,
    getChatMembersCount: async () => 150,
    sendPhoto: async (chatId, _photo, extra) => ({ message_id: 1, chat: { id: chatId }, caption: extra?.caption }),
    ...overrides,
  };
}

function stubFetch(handler) {
  const orig = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = orig;
  };
}

const fakeImage = () =>
  new Promise(resolve => {
    const b = Buffer.alloc(2048, 0xff);
    resolve({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => b,
    });
  });

describe('Welcome Card Service', () => {
  it('buildCardUrl memakai endpoint benar + 6 parameter wajib', () => {
    const url = buildCardUrl('welcome', {
      username: 'John',
      guildName: 'Anime Club',
      guildIcon: 'https://x/gi.jpg',
      memberCount: 150,
      avatar: 'https://x/av.jpg',
      background: 'https://x/bg.jpg',
    });
    assert.ok(url.includes('/welcomev1?'));
    for (const k of ['username', 'guildName', 'guildIcon', 'memberCount', 'avatar', 'background', 'quality']) {
      assert.ok(url.includes(`${k}=`), `kurang param ${k}`);
    }
    const goodbye = buildCardUrl('goodbye', {
      username: 'J',
      guildName: 'G',
      guildIcon: 'i',
      memberCount: 1,
      avatar: 'a',
      background: 'b',
    });
    assert.ok(goodbye.includes('/goodbyev1?'));
  });

  it('buildCardUrl fallback default bila avatar/background kosong', () => {
    const url = buildCardUrl('welcome', { username: 'A', guildName: 'G' });
    assert.ok(url.includes('avatar='));
    assert.ok(url.includes('background='));
    assert.ok(url.includes('guildIcon='));
  });

  it('resolveBackgroundUrl: URL custom > file_id > default bot', async () => {
    const tg = mockTelegram();
    assert.strictEqual(
      await resolveBackgroundUrl(tg, { backgroundUrl: 'https://x/bg.png' }),
      'https://x/bg.png'
    );
    assert.strictEqual(
      await resolveBackgroundUrl(tg, { backgroundFileId: 'fid123' }),
      'https://files.example/fid123.jpg'
    );
    const fallback = await resolveBackgroundUrl(tg, {});
    assert.ok(fallback.startsWith('https://'));
  });

  it('sendCardMessage mengirim foto + caption, memakai avatar & jumlah member asli', async () => {
    const tg = mockTelegram();
    const sent = [];
    tg.sendPhoto = async (chatId, _photo, extra) => {
      sent.push({ chatId, extra });
      return { message_id: 7 };
    };
    const restore = stubFetch(async url => {
      assert.ok(String(url).includes('memberCount=150'));
      assert.ok(String(url).includes('avatar=https'));
      return fakeImage();
    });
    try {
      const msg = await sendCardMessage(tg, '-1001', 'welcome', {
        member: { id: 5, first_name: 'John' },
        groupTitle: 'Anime Club',
        caption: 'Hello!',
        cardCfg: {},
      });
      assert.strictEqual(msg.message_id, 7);
      assert.strictEqual(sent[0].chatId, '-1001');
      assert.strictEqual(sent[0].extra.caption, 'Hello!');
    } finally {
      restore();
    }
  });

  it('sendCardMessage return null bila API kartu gagal (caller fallback teks)', async () => {
    const tg = mockTelegram();
    let photoCalled = false;
    tg.sendPhoto = async () => {
      photoCalled = true;
      return { message_id: 1 };
    };
    const restore = stubFetch(async () => {
      throw new Error('network down');
    });
    try {
      const msg = await sendCardMessage(tg, '-1001', 'goodbye', {
        member: { id: 5, first_name: 'Jo' },
        groupTitle: 'G',
        caption: 'Bye',
        cardCfg: {},
      });
      assert.strictEqual(msg, null);
      assert.strictEqual(photoCalled, false);
    } finally {
      restore();
    }
  });
});
