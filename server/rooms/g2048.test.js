import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, move, slideLine, canMove, rngNext } from '../../client/src/game/g2048.js';
import { create2048, MAX_MOVES } from './g2048.js';

const st = (board, rng = 1) => ({ board, score: 0, rng, moves: 0, over: false });

test('slideLine: gộp đúng luật', () => {
  assert.deepEqual(slideLine([2, 2, 2, 2]).out, [4, 4, 0, 0]);
  assert.deepEqual(slideLine([2, 2, 4, 4]).out, [4, 8, 0, 0]);
  assert.deepEqual(slideLine([4, 4, 8, 0]).out, [8, 8, 0, 0]);       // ô vừa gộp không gộp tiếp
  assert.deepEqual(slideLine([2, 0, 2, 4]).out, [4, 4, 0, 0]);
  assert.deepEqual(slideLine([0, 0, 0, 2]).out, [2, 0, 0, 0]);
  assert.deepEqual(slideLine([2, 4, 2, 4]).out, [2, 4, 2, 4]);
  assert.equal(slideLine([2, 2, 4, 4]).gained, 12);
});

test('move: 4 hướng, điểm, sinh ô mới, nước không đổi gì thì bỏ qua', () => {
  const b = [2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const r = move(st(b), 'left');
  assert.ok(r.moved);
  assert.deepEqual(r.state.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(r.state.score, 8);
  assert.equal(r.state.moves, 1);
  assert.equal(r.state.board.filter(Boolean).length, 3);  // 2 ô gộp + 1 ô mới
  assert.ok([2, 4].includes(r.spawn.v));
  const right = move(st([0, 0, 2, 2, ...new Array(12).fill(0)]), 'right');
  assert.equal(right.state.board[3], 4);
  const down = move(st([2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'down');
  assert.equal(down.state.board[12], 4);
  const up = move(st([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0]), 'up');
  assert.equal(up.state.board[1], 8);
  const none = move(st([2, 4, 0, 0, ...new Array(12).fill(0)]), 'left');
  assert.equal(none.moved, false);
  assert.equal(move(st(b), 'xx').moved, false);
  assert.equal(move(null, 'left').moved, false);
  // bản gốc không bị sửa
  assert.deepEqual(b, [2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test('hết nước → over', () => {
  const full = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 0];
  assert.ok(canMove(full));
  assert.ok(!canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]));
  const r = move(st([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 0, 8]), 'right');
  assert.ok(r.moved);
});

test('tất định theo seed', () => {
  assert.deepEqual(newGame(123), newGame(123));
  assert.notDeepEqual(newGame(1).board.join() + newGame(2).board.join(), newGame(1).board.join() + newGame(1).board.join());
  const play = (seed) => { let s = newGame(seed); const dirs = ['left', 'up', 'right', 'down']; for (let k = 0; k < 300 && !s.over; k++) s = move(s, dirs[k % 4]).state.moved ? move(s, dirs[k % 4]).state : move(s, dirs[(k + 1) % 4]).state; return s; };
  assert.deepEqual(play(777), play(777));
  const [r, a] = rngNext(5);
  assert.ok(r >= 0 && r < 1 && Number.isInteger(a));
});

test('server chơi lại khớp client; điểm server là chuẩn', () => {
  const core = create2048({ seed: () => 999 });
  core.start('a');
  let client = { ...core.privateView('a').game };      // client nhận trạng thái từ server
  const dirs = ['left', 'down', 'right', 'down', 'up'];
  let k = 0;
  while (!client.over && k < 5000) {
    const d = dirs[k++ % dirs.length];
    const r = move(client, d);
    if (!r.moved) continue;
    client = r.state;
    assert.ok(core.move('a', d).ok);
  }
  const srv = core.privateView('a').game;
  assert.deepEqual(srv.board, client.board);
  assert.equal(srv.score, client.score);
  assert.equal(srv.rng, client.rng);
  assert.ok(core.games.get('a').done === srv.over);
});

test('server: dữ liệu rác, chưa có ván, nước không hợp lệ, giới hạn số nước, dọn khi rời', () => {
  const core = create2048({ seed: () => 1 });
  assert.equal(core.move('x', 'left').ok, false);       // chưa có ván
  core.start('a');
  for (const junk of [null, undefined, 1, {}, [], 'LEFT', 'x'.repeat(1e5), ['left']]) assert.equal(core.move('a', junk).ok, false);
  // ép số nước gần giới hạn
  const p = core.games.get('a');
  p.g = { ...p.g, board: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], moves: MAX_MOVES - 1, score: 500 };
  const r = core.move('a', 'right');
  assert.ok(r.ok && r.ended);
  assert.equal(core.move('a', 'left').ok, false);       // ván đã chốt
  assert.equal(core.finish('a').score, 500);
  core.recordTop('An', 500);
  assert.deepEqual(core.topList()[0], { name: 'An', score: 500 });
  core.leave('a');
  assert.equal(core.games.size, 0);
  assert.equal(core.privateView('a').game, null);
});

test('bảng phòng không phình vô hạn', () => {
  const core = create2048();
  for (let k = 0; k < 1000; k++) core.recordTop(`n${k}`, k + 1);
  assert.ok(Object.keys(core.top).length <= 200);
  assert.equal(core.topList()[0].score, 1000);
});
