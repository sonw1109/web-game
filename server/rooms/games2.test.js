import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payout, rollDice, SYMBOLS } from './baucua.js';
import { correctPrefix, fold, wpm, TEXTS } from './typing.js';

test('bầu cua: trả thưởng đúng luật', () => {
  assert.equal(payout({ cua: 100 }, ['cua', 'ga', 'ca']), 200);        // trúng 1 → nhận lại 100 + 100
  assert.equal(payout({ cua: 100 }, ['cua', 'cua', 'cua']), 400);      // trúng 3 → 100 + 300
  assert.equal(payout({ cua: 100 }, ['ga', 'ga', 'ca']), 0);           // trượt → mất
  assert.equal(payout({ nai: 50, tom: 10 }, ['nai', 'tom', 'tom']), 100 + 30);
});

test('bầu cua: xúc xắc luôn hợp lệ', () => {
  for (let i = 0; i < 200; i++) { const d = rollDice(); assert.equal(d.length, 3); d.forEach((x) => assert.ok(SYMBOLS.includes(x))); }
});

test('gõ phím: so khớp không dấu, dừng ở chỗ sai', () => {
  assert.equal(correctPrefix('Có công mài sắt', 'co cong mai'), 11);
  assert.equal(correctPrefix('Có công mài sắt', 'Có công mài'), 11);
  assert.equal(correctPrefix('Đi một ngày', 'di mot ngay'), 11);
  assert.equal(correctPrefix('Có công', 'cx'), 1);
  assert.equal(fold('Đường'), 'duong');
  assert.equal(wpm(300, 60000), 60);
  for (const t of TEXTS) assert.ok(t.length > 50 && t.length < 160, t);
});
