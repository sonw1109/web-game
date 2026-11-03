import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemory, memoryView, TURN_MS, HIDE_MS, MAX_SEATS } from './memory.js';

/** Tìm 2 ô trùng / không trùng trong bộ bài bí mật (chỉ test mới được nhìn). */
const pairOf = (g) => { const d = g.s.deck; for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) if (!g.s.owner[i] && !g.s.owner[j] && d[i] === d[j]) return [i, j]; return null; };
const missOf = (g) => { const d = g.s.deck; for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) if (!g.s.owner[i] && !g.s.owner[j] && d[i] !== d[j]) return [i, j]; return null; };

const setup = (t = { v: 0 }) => {
  const g = createMemory({ now: () => t.v, rand: () => 0.42 });
  g.join('a'); g.join('b');
  return g;
};

test('ngồi bàn, bắt đầu, kích thước bàn', () => {
  const g = createMemory({ now: () => 0 });
  assert.ok(g.join('a'));
  assert.ok(!g.join('a'));
  assert.ok(!g.start('a', 8));                 // 1 người chưa đủ
  for (let k = 0; k < MAX_SEATS - 1; k++) assert.ok(g.join(`p${k}`));
  assert.ok(!g.join('thừa'));                  // tối đa 6
  assert.ok(!g.start('khách', 8));             // không ngồi bàn thì không bắt đầu
  assert.ok(g.start('p2', 12));
  assert.equal(g.s.host, 'p2');
  assert.equal(g.s.deck.length, 24);
  assert.ok(!g.join('muộn'));                  // đang chơi không vào thêm
  const g2 = setup();
  g2.start('a', 999);                          // rác → 8 cặp
  assert.equal(g2.s.deck.length, 16);
  const counts = {};
  for (const e of g2.s.deck) counts[e] = (counts[e] || 0) + 1;
  assert.ok(Object.values(counts).every((n) => n === 2));
});

test('lượt, trùng thì đi tiếp, không trùng thì úp lại sau 1.2s và chuyển lượt', () => {
  const t = { v: 0 };
  const g = setup(t);
  g.start('a', 8);
  assert.equal(g.turnId(), 'a');
  assert.equal(g.flip('b', 0), null);          // chưa tới lượt
  const [i, j] = pairOf(g);
  assert.equal(g.flip('a', i), 'one');
  assert.equal(g.flip('a', i), null);          // lật lại ô đang ngửa
  assert.equal(g.flip('a', j), 'match');
  assert.equal(g.s.pairs.a, 1);
  assert.equal(g.turnId(), 'a');               // trùng → đi tiếp
  assert.equal(g.flip('a', i), null);          // ô đã ăn
  const [x, y] = missOf(g);
  g.flip('a', x);
  assert.equal(g.flip('a', y), 'miss');
  assert.ok(g.s.hideAt);
  const [z] = missOf(g).filter((k) => k !== x && k !== y);
  assert.equal(g.flip('a', z ?? 0), null);     // đang chờ úp → chặn lật
  assert.equal(g.flip('b', z ?? 0), null);
  t.v = HIDE_MS - 1; assert.equal(g.tick(), null);
  t.v = HIDE_MS; assert.equal(g.tick(), 'hide');
  assert.deepEqual(g.s.flipped, []);
  assert.equal(g.turnId(), 'b');
});

test('rác không làm hỏng trạng thái', () => {
  const g = setup();
  g.start('a', 8);
  for (const junk of [null, undefined, -1, 16, 1.5, NaN, Infinity, '3', {}, [], 1e12]) assert.equal(g.flip('a', junk), null);
  assert.deepEqual(g.s.flipped, []);
});

test('hết giờ lượt → chuyển lượt', () => {
  const t = { v: 0 };
  const g = setup(t);
  g.start('a', 8);
  g.flip('a', 0);
  t.v = TURN_MS + 1;
  assert.equal(g.tick(), 'timeout');
  assert.equal(g.turnId(), 'b');
  assert.deepEqual(g.s.flipped, []);
});

test('người đang tới lượt rời → chuyển lượt; còn 1 người → hết ván', () => {
  const g = createMemory({ now: () => 0, rand: () => 0.1 });
  for (const id of ['a', 'b', 'c']) g.join(id);
  g.start('a', 8);
  const [x, y] = missOf(g);
  g.flip('a', x); g.flip('a', y);              // a sai → chờ úp
  g.leave('a');
  assert.equal(g.turnId(), 'b');
  assert.equal(g.s.hideAt, 0);
  assert.deepEqual(g.s.flipped, []);
  assert.equal(g.s.host, 'b');
  // người KHÔNG tới lượt rời → lượt giữ nguyên
  g.leave('c');
  assert.equal(g.s.status, 'over');            // còn 1 người
  assert.equal(g.s.reason, 'không đủ người chơi');
  const t = { v: 0 };
  const g2 = createMemory({ now: () => t.v });
  for (const id of ['a', 'b', 'c']) g2.join(id);
  g2.start('a', 8);
  const [p, q] = missOf(g2); g2.flip('a', p); g2.flip('a', q);
  t.v = HIDE_MS; g2.tick();                    // úp lại → lượt b
  assert.equal(g2.turnId(), 'b');
  g2.leave('a');                               // a đứng trước b, không phải lượt a
  assert.equal(g2.turnId(), 'b');
  g2.leave('c');                               // c là người cuối, lượt b
  assert.equal(g2.s.status, 'over');
});

test('ăn hết thẻ → người nhiều cặp nhất thắng', () => {
  const g = setup();
  g.start('a', 8);
  let pr;
  while ((pr = pairOf(g))) { g.flip(g.turnId(), pr[0]); g.flip(g.turnId(), pr[1]); }
  assert.equal(g.s.status, 'over');
  assert.deepEqual(g.s.winners, ['a']);
  assert.equal(g.s.pairs.a, 8);
});

test('view không lộ mặt thẻ úp', () => {
  const g = setup();
  g.start('a', 8);
  let v = memoryView(g, () => 'x', 0);
  assert.ok(v.cards.every((c) => !c.e));
  assert.ok(!JSON.stringify(v).includes(g.s.deck[0]) || v.cards.every((c) => !('e' in c)));
  assert.equal(JSON.stringify(v).match(/\p{Extended_Pictographic}/u), null);
  const [x, y] = missOf(g);
  g.flip('a', x);
  v = memoryView(g, () => 'x', 0);
  assert.equal(v.cards[x].e, g.s.deck[x]);
  assert.equal(v.cards.filter((c) => c.e).length, 1);
  g.flip('a', y);
  v = memoryView(g, () => 'x', 0);
  assert.equal(v.cards.filter((c) => c.e).length, 2);
  assert.ok(!('deck' in v));
});
