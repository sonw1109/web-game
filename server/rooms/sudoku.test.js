import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, solve, isValidSolution, createSudoku, DIFFS, IDLE_NEW_MS, RIGHT_PTS, WRONG_PTS } from './sudoku.js';

// RNG có seed để test lặp lại được
const seeded = (a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('sinh đề: lời giải hợp lệ, đề khớp lời giải, nghiệm duy nhất, đúng số gợi ý, nhanh', () => {
  for (const diff of Object.keys(DIFFS)) {
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      const { puzzle, solution } = generate(diff, seeded(k * 7 + 1));
      assert.ok(performance.now() - t < 200, `${diff} quá chậm`);
      assert.ok(isValidSolution(solution));
      puzzle.forEach((v, i) => { if (v) assert.equal(v, solution[i]); });
      assert.equal(solve(puzzle), 1);
      const clues = puzzle.filter(Boolean).length;
      assert.ok(clues >= DIFFS[diff].clues && clues <= DIFFS[diff].clues + 4, `${diff}: ${clues} ô gợi ý`);
    }
  }
});

test('solve: phát hiện đề mâu thuẫn và đề nhiều nghiệm', () => {
  const g = new Array(81).fill(0);
  assert.equal(solve(g), 2);          // bảng trống: nhiều nghiệm
  g[0] = 5; g[1] = 5;
  assert.equal(solve(g), 0);          // 2 số 5 cùng hàng
  assert.ok(!isValidSolution(new Array(81).fill(1)));
  assert.ok(!isValidSolution(null));
});

function fresh() {
  let t = 1000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const g = createSudoku({ now: clock.now, rand: seeded(42) });
  return { g, clock };
}
const firstEmpty = (s) => s.board.findIndex((v) => !v);

test('điền đúng → khóa ô, +10; sai → -5, ô vẫn trống; ô đã có số không điền được', () => {
  const { g } = fresh();
  const i = firstEmpty(g.s), right = g.s.solution[i], wrong = right % 9 + 1;
  let r = g.fill('a', 'An', { i, v: wrong });
  assert.equal(r.right, false);
  assert.equal(g.s.board[i], 0);
  r = g.fill('a', 'An', { i, v: right });
  assert.equal(r.right, true);
  assert.equal(g.s.board[i], right);
  assert.equal(g.s.scores.get('a').pts, RIGHT_PTS + WRONG_PTS);
  assert.equal(g.fill('b', 'Bình', { i, v: right }).ok, false);
  const given = g.s.givens.indexOf(true);
  assert.equal(g.fill('b', 'Bình', { i: given, v: 1 }).ok, false);
  const v = g.view();
  assert.equal(v.players[v.by[i]].id, 'a');
});

test('view không chứa lời giải', () => {
  const { g } = fresh();
  const v = g.view();
  assert.equal(v.solution, undefined);
  const json = JSON.stringify(v);
  assert.ok(!json.includes(g.s.solution.join(',')));
  v.board.forEach((x, i) => { if (x) assert.equal(x, g.s.solution[i]); else assert.equal(x, 0); });
});

test('giải xong → done, người nhiều điểm nhất thắng; ván mới chỉ khi xong hoặc 10 giây không ai điền', () => {
  const { g, clock } = fresh();
  assert.equal(g.newGame('hard'), false);          // vừa bắt đầu (lastFillAt = lúc tạo)
  clock.advance(IDLE_NEW_MS);
  assert.equal(g.canNew(), true);
  g.fill('a', 'An', { i: firstEmpty(g.s), v: g.s.solution[firstEmpty(g.s)] });
  assert.equal(g.canNew(), false);
  let k = 0, r;
  while ((r = firstEmpty(g.s)) >= 0) { g.fill(k++ % 3 ? 'a' : 'b', 'x', { i: r, v: g.s.solution[r] }); }
  assert.equal(g.s.status, 'done');
  assert.deepEqual(g.s.winners, ['a']);
  assert.equal(g.fill('a', 'An', { i: 0, v: 1 }).ok, false);
  assert.equal(g.newGame('hard'), true);
  assert.equal(g.s.diff, 'hard');
  assert.equal(g.s.status, 'playing');
  assert.equal(g.s.scores.size, 0);
});

test('dữ liệu rác không throw, không đổi bảng', () => {
  const { g } = fresh();
  const before = g.s.board.join();
  for (const junk of [null, undefined, 5, 'abc', [], {}, { i: -1, v: 1 }, { i: 81, v: 1 }, { i: 1.5, v: 2 }, { i: 0, v: 0 }, { i: 0, v: 10 },
    { i: '3', v: '4' }, { i: NaN, v: 1 }, { i: 0, v: Infinity }, { __proto__: { i: 1, v: 1 } }, new Array(1e5).fill(1)]) {
    assert.equal(g.fill('a', 'An', junk).ok, false);
  }
  assert.equal(g.s.board.join(), before);
  assert.equal(g.newGame({ evil: 1 }), false);
  for (const d of [null, 5, 'xxx', {}]) { const { g: h, clock } = fresh(); clock.advance(IDLE_NEW_MS); assert.ok(h.newGame(d)); assert.ok(DIFFS[h.s.diff]); }
});
