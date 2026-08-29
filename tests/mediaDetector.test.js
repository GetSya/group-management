const { describe, it } = require('node:test');
const assert = require('node:assert');
const { detectMediaType } = require('../src/utils/mediaDetector');

describe('Media Detector', () => {
  it('should detect photo message', () => {
    const msg = { photo: [{ file_id: '123' }] };
    assert.strictEqual(detectMediaType(msg), 'photo');
  });

  it('should detect video message', () => {
    const msg = { video: { file_id: '456' } };
    assert.strictEqual(detectMediaType(msg), 'video');
  });

  it('should detect sticker message', () => {
    const msg = { sticker: { file_id: '789' } };
    assert.strictEqual(detectMediaType(msg), 'sticker');
  });

  it('should return null for pure text message', () => {
    const msg = { text: 'Hello World' };
    assert.strictEqual(detectMediaType(msg), null);
  });
});
