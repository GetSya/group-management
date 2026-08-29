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

    const keyboard = buildCustomKeyboard(cmd.buttons);
    assert.ok(keyboard);
    assert.strictEqual(keyboard.reply_markup.inline_keyboard.length, 2);
  });

  it('should interpolate user and group variables in responses', () => {
    const mockCtx = {
      from: { id: 12345, first_name: 'John', last_name: 'Doe', username: 'johndoe' },
      chat: { id: -100123, title: 'Dev Community' },
    };

    const template = 'Hello {mention}, welcome to {group}! Your ID is {user_id}.';
    const rendered = customCommandService.interpolateVariables(template, mockCtx, 'HTML');

    assert.ok(rendered.includes('Dev Community'));
    assert.ok(rendered.includes('12345'));
    assert.ok(rendered.includes('John'));
  });
});
