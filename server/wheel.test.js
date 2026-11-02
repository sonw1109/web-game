import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, pickFood } from './wheel.js';

test('vòng quay có đúng 20 món, đủ thông tin, không trùng', () => {
  assert.equal(FOODS.length, 20);
  assert.equal(new Set(FOODS.map((f) => f.id)).size, 20);
  for (const f of FOODS) for (const k of ['id', 'name', 'icon', 'region', 'desc']) assert.ok(f[k], `${f.id} thiếu ${k}`);
});

test('quay ngẫu nhiên đều: món nào cũng có thể trúng', () => {
  const hit = new Array(20).fill(0);
  for (let i = 0; i < 20000; i++) hit[pickFood()]++;
  assert.ok(hit.every((n) => n > 700 && n < 1300), hit.join(','));
});
