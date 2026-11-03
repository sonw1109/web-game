import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFortune, FORTUNES } from './shrine.js';
import { EMOTES } from './world.js';

test('xin quẻ: mọi lần bốc đều ra quẻ hợp lệ, có đủ Đại Cát và Đại Hung', () => {
  const total = FORTUNES.reduce((a, f) => a + f.w, 0);
  const levels = new Set();
  for (let r = 0; r < total; r++) { const f = pickFortune(r); assert.ok(f.text && f.level); levels.add(f.level); }
  assert.ok(levels.has('Đại Cát') && levels.has('Đại Hung'));
  assert.equal(pickFortune(0).level, 'Đại Cát');
  assert.equal(pickFortune(total - 1).level, 'Đại Hung');
});

test('quỳ lạy là hành động hợp lệ', () => assert.ok(EMOTES.includes('kowtow')));
