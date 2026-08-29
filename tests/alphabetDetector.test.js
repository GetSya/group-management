const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isScriptAllowed, detectScripts } = require('../src/utils/alphabetDetector');

describe('Alphabet Detector', () => {
  it('should detect Latin text', () => {
    const scripts = detectScripts('Hello world');
    assert.ok(scripts.includes('LATIN'));
  });

  it('should detect Cyrillic text', () => {
    const scripts = detectScripts('Привет мир');
    assert.ok(scripts.includes('CYRILLIC'));
  });

  it('should detect Arabic text', () => {
    const scripts = detectScripts('مرحبا بك');
    assert.ok(scripts.includes('ARABIC'));
  });

  it('should enforce allowed scripts whitelist', () => {
    const isAllowed = isScriptAllowed('Привет мир', ['LATIN']);
    assert.strictEqual(isAllowed, false);

    const isLatinAllowed = isScriptAllowed('Hello world', ['LATIN']);
    assert.strictEqual(isLatinAllowed, true);
  });
});
