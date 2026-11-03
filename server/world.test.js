import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAppearance, reply, rateLimiter } from './world.js';

test('sanitizeAppearance chịu được dữ liệu rác (null, số, chuỗi)', () => {
  for (const bad of [null, undefined, 5, 'x', [], { skin: 'javascript:', hairStyle: 1e9 }]) {
    const a = sanitizeAppearance(bad);
    assert.match(a.skin, /^#[0-9a-f]{6}$/i);
    assert.ok(a.hairStyle >= 0 && a.hairStyle <= 3);
  }
});

test('reply chỉ gọi khi callback đúng là hàm (client có thể gửi rác)', () => {
  for (const bad of [null, 5, 'x', {}, []]) assert.doesNotThrow(() => reply(bad, { ok: 1 }));
  let got = null;
  reply((d) => { got = d; }, 7);
  assert.equal(got, 7);
});

test('rateLimiter chặn khi vượt ngưỡng', () => {
  const lim = rateLimiter(3, 1000);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => lim('a')), [true, true, true, false, false]);
  assert.equal(lim('b'), true); // người khác không bị ảnh hưởng
});

test('rateLimiter tự dọn các key đã hết hạn (không phình bộ nhớ)', async () => {
  const { rateLimiter } = await import('./world.js');
  const lim = rateLimiter(1, 20);
  for (let i = 0; i < 50; i++) lim(`k${i}`);
  assert.equal(lim.size(), 50);
  await new Promise((r) => setTimeout(r, 1150));
  assert.equal(lim.size(), 0);
});
