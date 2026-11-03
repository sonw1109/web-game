import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMines, HIDDEN, FLAG, MINE, BOOM, IDLE_NEW_MS, WIN_BONUS, TOP_BONUS } from './mines.js';

const seeded = (a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function fresh(size = 'l', seed = 1) {
  let t = 0;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const g = createMines({ now: clock.now, rand: seeded(seed) });
  g.reset(size);
  return { g, clock };
}
const nb = (g, i) => { const { w, h } = g.s, x = i % w, y = Math.floor(i / w), o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) o.push(ny * w + nx); } return o; };

test('ô đầu tiên và lân cận luôn an toàn, đúng số mìn', () => {
  for (let seed = 1; seed < 40; seed++) {
    for (const size of ['s', 'l']) {
      const { g } = fresh(size, seed);
      const first = Math.floor(seeded(seed + 99)() * g.s.w * g.s.h);
      const r = g.open('a', 'An', first);
      assert.ok(r.ok);
      assert.notEqual(r.ended, 'lost');
      for (const j of [first, ...nb(g, first)]) assert.equal(g.s.mine[j], 0);
      assert.equal(g.s.mine.reduce((a, b) => a + b, 0), g.s.mines);
      assert.equal(g.s.num[first], 0);
      assert.ok(r.opened > 1);                 // ô 0 → loang
    }
  }
});

test('loang BFS: mọi ô 0 đã mở thì lân cận cũng mở; không mở mìn', () => {
  const { g } = fresh('l', 7);
  g.open('a', 'An', 0);
  for (let i = 0; i < g.s.w * g.s.h; i++) {
    if (g.s.open[i]) assert.equal(g.s.mine[i], 0);
    if (g.s.open[i] && g.s.num[i] === 0) for (const j of nb(g, i)) assert.equal(g.s.open[j], 1);
  }
});

test('view không lộ mìn khi đang chơi; lộ hết khi thua', () => {
  const { g } = fresh('l', 3);
  g.open('a', 'An', 100);
  const v = g.view();
  assert.ok(!v.cells.some((c) => c === MINE || c === BOOM));
  assert.equal(v.mine, undefined); assert.equal(v.num, undefined);
  v.cells.forEach((c, i) => { if (c >= 0) assert.equal(c, g.s.num[i]); else assert.equal(c, HIDDEN); });
  const mineIdx = g.s.mine.indexOf(1);
  const r = g.open('b', 'Bình', mineIdx);
  assert.equal(r.ended, 'lost');
  const lv = g.view();
  assert.equal(lv.status, 'lost');
  assert.equal(lv.cells[mineIdx], BOOM);
  assert.equal(lv.cells.filter((c) => c === MINE || c === BOOM).length, g.s.mines);
  assert.equal(g.open('a', 'An', 0).ok, false);   // thua rồi không mở tiếp
  assert.ok(g.payout().every((p) => !p.win));
});

test('cờ: ai cắm cũng thấy, ô có cờ không mở được; chord mở xung quanh khi đủ cờ', () => {
  const { g } = fresh('l', 11);
  g.open('a', 'An', 0);
  // tìm ô số đã mở có ít nhất 1 lân cận chưa mở không phải mìn
  const i = [...g.s.open.keys()].find((k) => g.s.open[k] && g.s.num[k] > 0 && nb(g, k).some((j) => !g.s.open[j] && !g.s.mine[j]));
  assert.ok(i >= 0);
  assert.equal(g.open('b', 'Bình', i).ok, false);     // chưa đủ cờ → chord không làm gì
  for (const j of nb(g, i)) if (g.s.mine[j]) assert.ok(g.flag('b', 'Bình', j));
  assert.equal(g.view().cells[nb(g, i).find((j) => g.s.mine[j])], FLAG);
  assert.equal(g.view().minesLeft, g.s.mines - g.s.num[i]);
  const r = g.open('b', 'Bình', i);
  assert.ok(r.ok && r.opened > 0);
  for (const j of nb(g, i)) if (!g.s.mine[j]) assert.equal(g.s.open[j], 1);
  const flagged = nb(g, i).find((j) => g.s.mine[j]);
  assert.equal(g.open('a', 'An', flagged).ok, false);  // có cờ → không mở
  assert.ok(g.flag('a', 'An', flagged));               // gỡ cờ
  assert.equal(g.flag('a', 'An', i), false);           // ô đã mở không cắm cờ
});

test('chord với cờ sai → dẫm mìn, thua', () => {
  const { g } = fresh('l', 5);
  g.open('a', 'An', 0);
  const i = [...g.s.open.keys()].find((k) => g.s.open[k] && g.s.num[k] > 0 && nb(g, k).filter((j) => !g.s.open[j] && !g.s.mine[j]).length >= g.s.num[k]);
  if (i === undefined) return;
  const safe = nb(g, i).filter((j) => !g.s.open[j] && !g.s.mine[j]).slice(0, g.s.num[i]);
  for (const j of safe) g.flag('a', 'An', j);
  assert.equal(g.open('a', 'An', i).ended, 'lost');
});

test('mở hết ô an toàn → thắng, chia điểm: mỗi ô +1, thưởng chia đều, người mở nhiều nhất thêm thưởng', () => {
  const { g } = fresh('s', 9);
  g.open('a', 'An', 40);
  let r;
  for (let k = 0; k < 81; k++) if (!g.s.mine[k] && !g.s.open[k]) r = g.open(k % 2 ? 'a' : 'b', 'x', k);
  if (!r) r = { ended: g.s.status };
  assert.equal(g.s.status, 'won');
  const pay = g.payout();
  const a = pay.find((p) => p.id === 'a'), b = pay.find((p) => p.id === 'b');
  assert.equal(a.opened + (b?.opened || 0), 81 - 10);
  assert.ok(pay.every((p) => p.win));
  const share = Math.floor(WIN_BONUS / pay.length);
  for (const p of pay) assert.equal(p.pts, p.opened + share + (p.top ? TOP_BONUS : 0));
  assert.ok(pay.some((p) => p.top));
  assert.equal(g.view().minesLeft, 0);
});

test('ván mới: chỉ khi kết thúc hoặc 20 giây không ai thao tác; dữ liệu rác', () => {
  const { g, clock } = fresh('l', 2);
  assert.ok(g.newGame('s'));                          // chưa mở ô nào
  assert.equal(g.s.w, 9);
  g.open('a', 'An', 5);
  assert.equal(g.newGame('l'), false);
  clock.advance(IDLE_NEW_MS);
  assert.ok(g.newGame('l'));
  assert.equal(g.s.w, 16);
  for (const junk of [null, undefined, -1, 256, 1.5, '3', {}, [], NaN, Infinity, new Array(1e5)]) {
    assert.equal(g.open('a', 'An', junk).ok, false);
    assert.equal(g.flag('a', 'An', junk), false);
  }
  assert.equal(g.s.status, 'ready');
  assert.ok(g.newGame({ x: 1 }));
  assert.equal(g.s.w, 16);
});
