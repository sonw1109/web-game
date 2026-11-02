import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWin, createCaro, SIZE, TURN_MS } from './caro.js';

const idx = (x, y) => y * SIZE + x;

test('checkWin: ngang, dọc, chéo, chéo ngược', () => {
  for (const [dx, dy, sx, sy] of [[1, 0, 2, 3], [0, 1, 7, 7], [1, 1, 0, 0], [1, -1, 3, 10]]) {
    const b = new Array(SIZE * SIZE).fill('');
    for (let k = 0; k < 5; k++) b[idx(sx + dx * k, sy + dy * k)] = 'X';
    assert.equal(checkWin(b, sx + dx * 2, sy + dy * 2).length, 5);
  }
});

test('checkWin: 4 ô thì chưa thắng, không tràn qua mép bàn', () => {
  const b = new Array(SIZE * SIZE).fill('');
  for (let k = 0; k < 4; k++) b[idx(11 + k, 0)] = 'O';
  b[idx(0, 1)] = 'O'; // ô đầu hàng dưới – không được tính nối tiếp
  assert.equal(checkWin(b, 14, 0), null);
});

test('ván đầy đủ: lượt, thắng, đếm điểm, chơi lại', () => {
  const g = createCaro(() => 0);
  assert.ok(g.sit('a', 'X'));
  assert.ok(!g.sit('a', 'O'));         // 1 người không ngồi 2 ghế
  assert.ok(g.sit('b', 'O'));
  assert.equal(g.s.status, 'playing');
  assert.ok(!g.move('b', idx(0, 0)));  // chưa tới lượt O
  for (let k = 0; k < 4; k++) { assert.ok(g.move('a', idx(k, 0))); assert.ok(g.move('b', idx(k, 1))); }
  assert.ok(!g.move('a', idx(0, 1)));  // ô đã có quân
  g.move('a', idx(4, 0));
  assert.equal(g.s.winner, 'X');
  assert.equal(g.s.wins.a, 1);
  assert.ok(g.rematch('b'));
  assert.equal(g.s.status, 'playing');
  assert.equal(g.s.board.filter(Boolean).length, 0);
});

test('hết giờ và rời ghế khi đang chơi → thua', () => {
  let t = 0;
  const g = createCaro(() => t);
  g.sit('a', 'X'); g.sit('b', 'O');
  t = TURN_MS + 1;
  assert.ok(g.tick());
  assert.equal(g.s.winner, 'O');
  g.rematch('a');
  g.leave('b');
  assert.equal(g.s.winner, 'X');
  assert.equal(g.s.seats.O, null);
});
