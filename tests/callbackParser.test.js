const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseCallback } = require('../src/utils/callbackParser');

describe('Callback Parser', () => {
  it('should parse simple callback', () => {
    const res = parseCallback('settings:media');
    assert.strictEqual(res.module, 'settings');
    assert.strictEqual(res.action, 'media');
    assert.deepStrictEqual(res.params, []);
  });

  it('should parse callback with parameters', () => {
    const res = parseCallback('media:toggle:video');
    assert.strictEqual(res.module, 'media');
    assert.strictEqual(res.action, 'toggle');
    assert.deepStrictEqual(res.params, ['video']);
  });

  it('should handle multi-param callbacks', () => {
    const res = parseCallback('captcha:verify:12345:math');
    assert.strictEqual(res.module, 'captcha');
    assert.strictEqual(res.action, 'verify');
    assert.deepStrictEqual(res.params, ['12345', 'math']);
  });
});
