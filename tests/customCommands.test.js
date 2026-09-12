// Isolasi test: paksa file driver + db sementara (jangan sentuh bin JsonVault produksi).
process.env.DB_DRIVER = 'file';
if (!process.env.DB_PATH) {
  const __fs = require('fs');
  const __os = require('os');
  const __path = require('path');
  process.env.DB_PATH = __path.join(
    __fs.mkdtempSync(__path.join(__os.tmpdir(), 'bot-db-test-')),
    'db.json'
  );
}

const { describe, it } = require('node:test');
const assert = require('node:assert');
const db = require('../src/database/database');
const customCommandRepo = require('../src/modules/customCommands/customCommandRepository');
const customCommandService = require('../src/modules/customCommands/customCommandService');
const { parseCommandText } = require('../src/modules/customCommands/customCommandParser');
const {
  validateCommandName,
  validateUrl,
  validateButtonText,
} = require('../src/modules/customCommands/customCommandValidator');
const { buildCustomKeyboard } = require('../src/modules/customCommands/customCommandKeyboard');

describe('Custom Commands & Buttons Suite', async () => {
  await db.init();

  it('should validate command names and reject reserved names', () => {
    assert.strictEqual(validateCommandName('rules').valid, true);
    assert.strictEqual(validateCommandName('/info').valid, true);
    assert.strictEqual(validateCommandName('/settings').valid, false); // Reserved
    assert.strictEqual(validateCommandName('invalid name with spaces').valid, false);
  });

  it('should validate URLs and reject javascript: schemes', () => {
    assert.strictEqual(validateUrl('https://example.com').valid, true);
    assert.strictEqual(validateUrl('javascript:alert(1)').valid, false);
    assert.strictEqual(validateUrl('ftp://invalid.com').valid, false);
  });

  it('should parse command texts correctly', () => {
    assert.deepStrictEqual(parseCommandText('/donate'), {
      isCommand: true,
      command: 'donate',
      raw: '/donate',
    });

    assert.deepStrictEqual(parseCommandText('/donate@MyBot hello', 'MyBot'), {
      isCommand: true,
      command: 'donate',
      raw: '/donate@MyBot hello',
    });

    assert.strictEqual(parseCommandText('just regular chat').isCommand, false);
  });

  it('should create and isolate custom commands per group', () => {
    const groupA = '-100999111';
    const groupB = '-100999222';

    // Group A creates /info
    customCommandRepo.create(groupA, {
      name: 'info',
      response: 'Info Group A',
    });

    // Group B creates /info
    customCommandRepo.create(groupB, {
      name: 'info',
      response: 'Info Group B',
    });

    const cmdA = customCommandRepo.findByName(groupA, 'info');
    const cmdB = customCommandRepo.findByName(groupB, 'info');

    assert.strictEqual(cmdA.response, 'Info Group A');
    assert.strictEqual(cmdB.response, 'Info Group B');
  });

  it('should add buttons and render inline keyboards', () => {
    const group = '-100888333';
    customCommandRepo.create(group, {
      name: 'socials',
      response: 'Follow our socials!',
    });

    customCommandRepo.addButton(group, 'socials', {
      text: '🌐 Website',
      type: 'url',
      url: 'https://example.com',
    });

    customCommandRepo.addButton(group, 'socials', {
      text: '📜 Rules',
      type: 'command',
      action: { command: 'rules' },
    });

    const cmd = customCommandRepo.findByName(group, 'socials');
    assert.strictEqual(cmd.buttons.length, 2);

    const keyboard = buildCustomKeyboard(cmd.buttons, 1, 'socials');
    assert.ok(keyboard);
    // 2 buttons -> grid 2 cols = 1 row
    assert.strictEqual(keyboard.reply_markup.inline_keyboard.length, 1);
    assert.strictEqual(keyboard.reply_markup.inline_keyboard[0].length, 2);
  });

  it('should paginate button keyboards 5x2 (10 per page)', () => {
    // 12 flat buttons -> page 1: 5 rows (10 btns) + nav = 6 rows, page 2: 1 row + nav = 2 rows
    const fakeButtons = [];
    for (let i = 0; i < 12; i++) {
      fakeButtons.push([{ id: `btn_${i}`, text: `Btn ${i}`, type: 'response', response: 'hi' }]);
    }
    const p1 = buildCustomKeyboard(fakeButtons, 1, 'sosmedbooster');
    assert.strictEqual(p1.reply_markup.inline_keyboard.length, 6);
    assert.strictEqual(p1.reply_markup.inline_keyboard[0].length, 2);
    // nav row present on last row
    const navText = p1.reply_markup.inline_keyboard[5].map(b => b.text).join(' ');
    assert.ok(navText.includes('1/2'));

    const p2 = buildCustomKeyboard(fakeButtons, 2, 'sosmedbooster');
    assert.strictEqual(p2.reply_markup.inline_keyboard.length, 2);
    assert.strictEqual(p2.reply_markup.inline_keyboard[0].length, 2);
  });

  it('should interpolate user and group variables in responses', () => {
    const mockCtx = {
      from: { id: 12345, first_name: 'John', last_name: 'Doe', username: 'johndoe' },
      chat: { id: -100123, title: 'Dev Community' },
    };

    const template = 'Hello @mention, welcome to @group! Your ID is @user_id.';
    const rendered = customCommandService.interpolateVariables(template, mockCtx, 'HTML');

    assert.ok(rendered.includes('Dev Community'));
    assert.ok(rendered.includes('12345'));
    assert.ok(rendered.includes('John'));

    // backward compat {} masih jalan
    const legacy = customCommandService.interpolateVariables('Hi {mention} di {group}', mockCtx, 'HTML');
    assert.ok(legacy.includes('Dev Community'));
  });

  it('should interpolate @price_ @stock_ @sisa_kuota @order_id from catalog', () => {
    const catalogRepo = require('../src/modules/catalog/catalogRepository');
    const chatId = '-100777catalog';
    const userId = 555001;

    catalogRepo.setProduct(chatId, 'nokos', { price: 15000, stock: 12, quota: 7 });
    catalogRepo.setProduct(chatId, 'sosmedbooster', { price: 25000, stock: 30 });

    const mockCtx = {
      from: { id: userId, first_name: 'Budi', username: 'budi' },
      chat: { id: Number(chatId), title: 'Test Group' },
      targetChatId: chatId,
    };

    const t1 = customCommandService.interpolateVariables(
      'Harga @price_nokos, stok @stock_nokos, sisa @sisa_kuota_nokos',
      mockCtx,
      'HTML'
    );
    assert.ok(t1.includes('Rp15.000'), `t1=${t1}`);
    assert.ok(t1.includes('7'), `t1=${t1}`);

    // bare @price / @sisa_kuota mengikuti command saat ini (reusable template)
    const t2 = customCommandService.interpolateVariables('Harga @price, sisa @sisa_kuota', mockCtx, 'HTML', {
      commandName: 'nokos',
    });
    assert.ok(t2.includes('Rp15.000'), `t2=${t2}`);
    assert.ok(t2.includes('7'), `t2=${t2}`);

    // produk belum ada -> fallback jelas, bukan crash
    const t3 = customCommandService.interpolateVariables('Harga @price_belumada', mockCtx, 'HTML');
    assert.ok(t3.includes('Belum diatur'), `t3=${t3}`);

    // belum ada order -> @order_id = -
    const t4 = customCommandService.interpolateVariables('Order @order_id', mockCtx, 'HTML');
    assert.ok(t4.includes('-'), `t4=${t4}`);

    catalogRepo.createOrder(chatId, String(userId), { product: 'nokos', amount: 15000 });
    const t5 = customCommandService.interpolateVariables('Order @order_id', mockCtx, 'HTML');
    assert.ok(t5.includes('ORD-'), `t5=${t5}`);
  });
});
