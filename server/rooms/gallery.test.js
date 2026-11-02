import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImage } from './gallery.js';

test('detectImage nhận đúng định dạng ảnh, từ chối file khác', () => {
  const pad = (b) => Buffer.concat([Buffer.from(b), Buffer.alloc(16)]);
  assert.equal(detectImage(pad([0xff, 0xd8, 0xff, 0xe0])).ext, 'jpg');
  assert.equal(detectImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ext, 'png');
  assert.equal(detectImage(pad([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])).ext, 'webp');
  assert.equal(detectImage(pad([...Buffer.from('GIF89a')])).ext, 'gif');
  assert.equal(detectImage(pad([...Buffer.from('<html><script>')])), null);
  assert.equal(detectImage(Buffer.from([0xff, 0xd8])), null);
});
