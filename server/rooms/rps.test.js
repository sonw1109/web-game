import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beats, scoreRound, createRps, rpsView, COUNT_MS, PICK_MS, RESULT_MS } from './rps.js';

test('luật: búa > kéo > bao > búa, hòa khi giống nhau', () => {
  assert.ok(beats('rock', 'scissors'));
  assert.ok(beats('scissors', 'paper'));
  assert.ok(beats('paper', 'rock'));
  assert.ok(!beats('scissors', 'rock'));
  assert.ok(!beats('rock', 'rock'));
  assert.ok(!beats('rock', 'banana'));
});

test('tính điểm: +1 cho mỗi người mình thắng', () => {
  const r = scoreRound([['a', 'rock'], ['b', 'scissors'], ['c', 'scissors'], ['d', 'rock']]);
  assert.equal(r.gains.a, 2); assert.equal(r.gains.d, 2);
  assert.equal(r.gains.b, 0); assert.equal(r.losses.b, 2);
  assert.equal(r.wins.length, 4);
  const all3 = scoreRound([['a', 'rock'], ['b', 'paper'], ['c', 'scissors']]);
  assert.deepEqual([all3.gains.a, all3.gains.b, all3.gains.c], [1, 1, 1]);
});

const run = () => {
  const t = { v: 0 };
  const g = createRps({ now: () => t.v });
  return { t, g };
};

test('vòng chơi: chỉ chạy khi ≥2 người, đếm ngược → chọn → kết quả → vòng mới', () => {
  const { t, g } = run();
  assert.equal(g.tick(['a']), null);
  assert.equal(g.s.phase, 'idle');
  assert.equal(g.tick(['a', 'b']), 'count');
  assert.ok(!g.pick('a', 'rock'));             // chưa tới pha chọn
  t.v = COUNT_MS; assert.equal(g.tick(['a', 'b']), 'pick');
  assert.ok(g.pick('a', 'rock'));
  assert.ok(g.pick('a', 'paper'));             // đổi được
  assert.ok(g.pick('b', 'rock'));
  t.v += PICK_MS; assert.equal(g.tick(['a', 'b']), 'result');
  assert.equal(g.s.last.picks.a, 'paper');
  assert.equal(g.s.scores.a, 1); assert.equal(g.s.scores.b || 0, 0);
  assert.equal(g.s.streak.a, 1); assert.equal(g.s.streak.b, 0);
  t.v += RESULT_MS; assert.equal(g.tick(['a', 'b']), 'count');
  t.v += COUNT_MS; g.tick(['a', 'b']);
  g.pick('a', 'paper'); g.pick('b', 'rock');
  t.v += PICK_MS; g.tick(['a', 'b']);
  assert.equal(g.s.streak.a, 2); assert.equal(g.s.best.a, 2);
  t.v += RESULT_MS; assert.equal(g.tick(['a']), 'idle');   // còn 1 người → dừng
});

test('không lộ lựa chọn trước khi lộ', () => {
  const { t, g } = run();
  g.tick(['a', 'b']); t.v = COUNT_MS; g.tick(['a', 'b']);
  g.pick('a', 'scissors');
  const v = rpsView(g, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], t.v);
  const json = JSON.stringify(v);
  for (const c of ['rock', 'paper', 'scissors']) assert.ok(!json.includes(c), c);
  assert.equal(v.players.find((p) => p.id === 'a').picked, true);
  assert.equal(v.players.find((p) => p.id === 'b').picked, false);
  assert.equal(v.last, null);
  g.pick('b', 'paper');
  t.v += PICK_MS; g.tick(['a', 'b']);
  const after = rpsView(g, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], t.v);
  assert.equal(after.last.picks.a, 'scissors');
});

test('khán giả, người rời, dữ liệu rác', () => {
  const { t, g } = run();
  assert.ok(g.watch('c', true));
  assert.equal(g.tick(['a', 'c']), null);      // c chỉ xem → chưa đủ 2
  g.watch('c', false);
  g.tick(['a', 'c']); t.v = COUNT_MS; g.tick(['a', 'c']);
  for (const junk of [null, undefined, 1, 'ROCK', 'lizard', {}, [], 'x'.repeat(1e5)]) assert.ok(!g.pick('a', junk));
  assert.equal(g.s.picks.size, 0);
  for (const junk of [null, 'yes', 1, {}]) assert.ok(!g.watch('a', junk));
  g.pick('a', 'rock'); g.pick('c', 'scissors');
  g.watch('c', true);                          // chuyển sang xem → bỏ lựa chọn
  assert.ok(!g.pick('c', 'rock'));
  g.leave('a');
  assert.equal(g.s.picks.size, 0);
  t.v += PICK_MS; assert.equal(g.tick(['b', 'd']), 'result');
  assert.deepEqual(g.s.last.picks, {});
  // người đã rời mà còn trong picks thì không được tính
  t.v += RESULT_MS; g.tick(['b', 'd']); t.v += COUNT_MS; g.tick(['b', 'd']);
  g.pick('b', 'rock'); g.pick('d', 'paper'); g.pick('ghost', 'scissors');
  t.v += PICK_MS; g.tick(['b', 'd']);
  assert.equal(Object.keys(g.s.last.picks).length, 2);
});
