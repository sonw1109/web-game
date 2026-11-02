import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImage } from './gallery.js';

test('detectImage nhận đúng định dạng ảnh, từ chối file khác', () => {
  const body = Buffer.alloc(200);
  const make = (head, end = []) => Buffer.concat([Buffer.from(head), body, Buffer.from(end)]);
  assert.equal(detectImage(make([0xff, 0xd8, 0xff, 0xe0], [0xff, 0xd9])).ext, 'jpg');
  assert.equal(detectImage(make([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [...Buffer.from('IEND'), 0xae, 0x42, 0x60, 0x82])).ext, 'png');
  const webp = make([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]); webp.writeUInt32LE(webp.length - 8, 4);
  assert.equal(detectImage(webp).ext, 'webp');
  assert.equal(detectImage(make([...Buffer.from('GIF89a')], [0x3b])).ext, 'gif');
  assert.equal(detectImage(make([...Buffer.from('<html><script>')])), null);
  assert.equal(detectImage(Buffer.from([0xff, 0xd8])), null);
  // giả mạo: chỉ có phần đầu JPEG, không có phần kết thúc
  assert.equal(detectImage(make([0xff, 0xd8, 0xff, 0xe0])), null);
  assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
});
