import test from 'node:test';
import assert from 'node:assert/strict';
import { pickShake, FRUIT_COUNT } from './interact.js';
import { EMOTES } from './world.js';

test('rung cây thường: quả / chim / lá theo tỉ lệ', () => {
  assert.deepEqual(pickShake('tree', 0, 3), { type: 'fruit', fruit: 3 });
  assert.equal(pickShake('tree', 40).type, 'bird');
  assert.equal(pickShake('tree', 99).type, 'leaves');
  for (let r = 0; r < 100; r++) { const o = pickShake('tree', r, r % FRUIT_COUNT); if (o.type === 'fruit') assert.ok(o.fruit >= 0 && o.fruit < FRUIT_COUNT); }
});

test('cây hoa đào không rụng quả', () => {
  for (let r = 0; r < 100; r++) assert.notEqual(pickShake('sakura', r).type, 'fruit');
});

test('có đủ biểu cảm mới', () => {
  for (const e of ['laugh', 'love', 'angry', 'cry', 'shock', 'sleep', 'shy', 'cheer', 'dance']) assert.ok(EMOTES.includes(e));
});
