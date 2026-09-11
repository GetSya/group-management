// Isolasi test: file driver + db sementara.
process.env.DB_DRIVER = 'file';
if (!process.env.DB_PATH) {
  const __fs = require('fs');
  const __os = require('os');
  const __path = require('path');
  process.env.DB_PATH = __path.join(
    __fs.mkdtempSync(__path.join(__os.tmpdir(), 'bot-chatmember-test-')),
    'db.json'
  );
}

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const db = require('../src/database/database');
const {
  classifyChatMemberUpdate,
  deliverWelcome,
  deliverGoodbye,
  handleChatMemberUpdate,
} = require('../src/bot/handlers/memberHandler');

const CHAT = '-100555';

function mockTelegram() {
  const calls = [];
  return {
    calls,
    sendMessage: async (chatId, text, extra) => {
      calls.push({ method: 'sendMessage', chatId: String(chatId), text, extra });
      return { message_id: 101 };
    },
    sendPhoto: async () => {
      calls.push({ method: 'sendPhoto' });
      throw new Error('should not be called (card disabled)');
    },
    deleteMessage: async () => true,
    getUserProfilePhotos: async () => ({ photos: [] }),
    getChat: async () => ({}),
    getChatMembersCount: async () => 42,
  };
}

function cmUpdate(oldStatus, newStatus, userId = 777) {
  return {
    chat: { id: CHAT, title: 'Test Group', type: 'supergroup' },
    from: { id: 1, first_name: 'Admin' },
    old_chat_member: { status: oldStatus, user: { id: userId } },
    new_chat_member: {
      status: newStatus,
      user: { id: userId, first_name: 'Newbie', username: 'newbie' },
    },
  };
}

describe('classifyChatMemberUpdate', () => {
  it('left/kicked -> member = join', () => {
    assert.strictEqual(classifyChatMemberUpdate('left', 'member'), 'join');
    assert.strictEqual(classifyChatMemberUpdate('kicked', 'member'), 'join');
  });

  it('member -> left/kicked = leave', () => {
    assert.strictEqual(classifyChatMemberUpdate('member', 'left'), 'leave');
    assert.strictEqual(classifyChatMemberUpdate('member', 'kicked'), 'leave');
    assert.strictEqual(classifyChatMemberUpdate('administrator', 'left'), 'leave');
  });

  it('perubahan non join/leave = null', () => {
    assert.strictEqual(classifyChatMemberUpdate('member', 'administrator'), null);
    assert.strictEqual(classifyChatMemberUpdate('member', 'restricted'), null);
    assert.strictEqual(classifyChatMemberUpdate('restricted', 'member'), null);
    assert.strictEqual(classifyChatMemberUpdate('left', 'left'), null);
    assert.strictEqual(classifyChatMemberUpdate('left', 'kicked'), null);
  });
});

describe('deliverWelcome / deliverGoodbye + dedup', async () => {
  await db.init();

  it('deliverWelcome kirim teks bila enabled, dedup cegah kirim ganda', async () => {
    const tg = mockTelegram();
    const member = { id: 1001, first_name: 'Budi' };
    const r1 = await deliverWelcome(tg, CHAT, 'Test Group', member);
    assert.strictEqual(r1.delivered, true);
    assert.strictEqual(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
    assert.match(tg.calls[0].text, /Budi/);

    // Panggilan kedua (simulasi dobel update service-message + chat_member) disaring
    const r2 = await deliverWelcome(tg, CHAT, 'Test Group', member);
    assert.strictEqual(r2.delivered, false);
    assert.strictEqual(r2.reason, 'duplicate');
    assert.strictEqual(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
  });

  it('deliverWelcome diam bila welcome disabled', async () => {
    const tg = mockTelegram();
    const s = db.getGroupSettings(CHAT);
    s.welcome.enabled = false;
    const r = await deliverWelcome(tg, CHAT, 'Test Group', { id: 1002, first_name: 'Siti' });
    assert.strictEqual(r.delivered, false);
    assert.strictEqual(r.reason, 'disabled');
    assert.strictEqual(tg.calls.length, 0);
    s.welcome.enabled = true;
  });

  it('deliverGoodbye kirim bila enabled', async () => {
    const tg = mockTelegram();
    const s = db.getGroupSettings(CHAT);
    s.goodbye.enabled = true;
    const r = await deliverGoodbye(tg, CHAT, 'Test Group', { id: 1003, first_name: 'Andi' });
    assert.strictEqual(r.delivered, true);
    assert.strictEqual(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
    s.goodbye.enabled = false;
  });
});

describe('handleChatMemberUpdate (fallback Hidden Members)', async () => {
  await db.init();

  before(() => {
    const s = db.getGroupSettings(CHAT);
    s.welcome.enabled = true;
    s.goodbye.enabled = true;
  });

  it('join via chat_member -> welcome terkirim', async () => {
    const tg = mockTelegram();
    const ctx = { update: { chat_member: cmUpdate('left', 'member', 2001) }, botInfo: { id: 999 }, telegram: tg };
    await handleChatMemberUpdate(ctx);
    assert.strictEqual(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
  });

  it('leave via chat_member -> goodbye terkirim', async () => {
    const tg = mockTelegram();
    const ctx = { update: { chat_member: cmUpdate('member', 'left', 2002) }, botInfo: { id: 999 }, telegram: tg };
    await handleChatMemberUpdate(ctx);
    assert.strictEqual(tg.calls.filter(c => c.method === 'sendMessage').length, 1);
  });

  it('promote (member->administrator) diabaikan', async () => {
    const tg = mockTelegram();
    const ctx = { update: { chat_member: cmUpdate('member', 'administrator', 2003) }, botInfo: { id: 999 }, telegram: tg };
    await handleChatMemberUpdate(ctx);
    assert.strictEqual(tg.calls.length, 0);
  });

  it('perubahan status bot sendiri diabaikan', async () => {
    const tg = mockTelegram();
    const ctx = { update: { chat_member: cmUpdate('member', 'administrator', 999) }, botInfo: { id: 999 }, telegram: tg };
    await handleChatMemberUpdate(ctx);
    assert.strictEqual(tg.calls.length, 0);
  });
});
