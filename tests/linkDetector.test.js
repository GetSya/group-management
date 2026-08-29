const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkLinks } = require('../src/utils/linkDetector');

describe('Link Detector', () => {
  it('should detect regular website links', () => {
    const res = checkLinks('Visit https://example.com for more info', false, []);
    assert.strictEqual(res.hasLinks, true);
    assert.strictEqual(res.isAllowed, false);
  });

  it('should allow whitelisted domains', () => {
    const res = checkLinks('Watch this video https://youtube.com/watch?v=123', false, ['youtube.com']);
    assert.strictEqual(res.hasLinks, true);
    assert.strictEqual(res.isAllowed, true);
  });

  it('should block telegram invite links if disallowed', () => {
    const res = checkLinks('Join t.me/mychannel', false, ['youtube.com']);
    assert.strictEqual(res.hasLinks, true);
    assert.strictEqual(res.isAllowed, false);
    assert.strictEqual(res.reason, 'telegram_link_disallowed');
  });

  it('should allow telegram invite links if explicitly allowed', () => {
    const res = checkLinks('Join t.me/mychannel', true, ['t.me']);
    assert.strictEqual(res.hasLinks, true);
    assert.strictEqual(res.isAllowed, true);
  });
});
