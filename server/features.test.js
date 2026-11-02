import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFish, FISH, pickWeather, WEATHERS } from './features.js';

test('câu cá: bốc theo tỉ lệ, mọi kết quả đều hợp lệ', () => {
  const ids = new Set(FISH.map((f) => f.id));
  const count = {};
  for (let i = 0; i < 20000; i++) { const f = pickFish(); assert.ok(ids.has(f.id)); count[f.rarity] = (count[f.rarity] || 0) + 1; }
  assert.ok(count['thường'] > count['hiếm'], 'cá thường phải nhiều hơn cá hiếm');
  assert.ok((count['huyền thoại'] || 0) < 400, 'huyền thoại phải rất hiếm');
  assert.equal(pickFish(0).id, FISH[0].id);
  assert.equal(pickFish(0.999999).id, FISH[FISH.length - 1].id);
});

test('thời tiết: luôn là 1 trong các loại hợp lệ', () => {
  for (let r = 0; r < 100; r++) assert.ok(WEATHERS.includes(pickWeather(r)));
  assert.equal(pickWeather(0), 'clear');
  assert.equal(pickWeather(99), 'snow');
});
