import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestMove } from './caroAI.js';

const N = 15;
const idx = (x, y) => y * N + x;
const empty = () => new Array(N * N).fill('');

test('bàn trống → đánh giữa', () => {
  assert.equal(bestMove(empty(), 'X'), idx(7, 7));
});

test('có 4 quân → đánh ô thứ 5 để thắng', () => {
  const b = empty();
  for (let k = 0; k < 4; k++) b[idx(3 + k, 5)] = 'O';
  b[idx(2, 5)] = 'X'; // một đầu bị chặn
  b[idx(9, 9)] = 'X'; b[idx(10, 10)] = 'X';
  assert.equal(bestMove(b, 'O'), idx(7, 5));
});

test('đối thủ có 4 → phải chặn', () => {
  const b = empty();
  for (let k = 0; k < 4; k++) b[idx(6, 2 + k)] = 'X';
  b[idx(6, 1)] = 'O';
  b[idx(12, 12)] = 'O';
  assert.equal(bestMove(b, 'O'), idx(6, 6));
});

test('đối thủ có 3 mở hai đầu → chặn một đầu', () => {
  const b = empty();
  for (let k = 0; k < 3; k++) b[idx(5 + k, 7)] = 'X';
  b[idx(1, 1)] = 'O';
  assert.ok([idx(4, 7), idx(8, 7)].includes(bestMove(b, 'O')));
});
