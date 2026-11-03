import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeAnswer, isCorrect, maskAnswer, pointsFor, createRiddle, riddleView, loadRiddles,
  ASK_MS, HINT1_MS, HINT2_MS, REVEAL_MS, OVER_MS, ROUNDS, MAX_GUESSES, PTS_MAX, PTS_MIN,
} from './riddle.js';

test('normalizeAnswer: bỏ dấu, hoa thường, khoảng trắng, dấu câu, chữ con/cái/quả ở đầu', () => {
  assert.equal(normalizeAnswer('  Con   CUA!! '), 'cua');
  assert.equal(normalizeAnswer('cái lược'), 'luoc');
  assert.equal(normalizeAnswer('Quả Nhãn'), 'nhan');
  assert.equal(normalizeAnswer('là con bò'), 'bo');
  assert.equal(normalizeAnswer('Đường đời'), 'duong doi');
  assert.equal(normalizeAnswer('con'), 'con');            // không bỏ hết chữ
  assert.equal(normalizeAnswer('   '), '');
  for (const junk of [null, undefined, 5, {}, [], () => 1]) assert.equal(normalizeAnswer(junk), '');
  assert.ok(normalizeAnswer('a'.repeat(100000)).length <= 200);
});

test('isCorrect: so khớp với danh sách đáp án', () => {
  assert.ok(isCorrect('cua', ['con cua']));
  assert.ok(isCorrect('CON CUA', ['con cua']));
  assert.ok(isCorrect('gay tay', ['gãy tay']));
  assert.ok(!isCorrect('con ghẹ', ['con cua']));
  assert.ok(!isCorrect('', ['con cua']));
  assert.ok(!isCorrect('cua', null));
});

test('maskAnswer chỉ lộ chữ cái đầu và số chữ', () => {
  const m = maskAnswer('đường đời');
  assert.ok(m.startsWith('Đ'));
  assert.ok(m.includes('(2 chữ)'));
  assert.ok(!m.includes('ời'));
});

test('điểm giảm dần 100 → 40', () => {
  assert.equal(pointsFor(0), PTS_MAX);
  assert.equal(pointsFor(ASK_MS), PTS_MIN);
  assert.equal(pointsFor(ASK_MS * 9), PTS_MIN);
  assert.ok(pointsFor(10_000) < PTS_MAX && pointsFor(10_000) > PTS_MIN);
});

test('dữ liệu riddles-vi.json hợp lệ', () => {
  const raw = JSON.parse(readFileSync(new URL('../data/riddles-vi.json', import.meta.url), 'utf8'));
  assert.ok(raw.length >= 80, `chỉ có ${raw.length} câu`);
  const seen = new Set();
  for (const r of raw) {
    assert.equal(typeof r.q, 'string'); assert.ok(r.q.trim().length > 5, r.q);
    assert.ok(Array.isArray(r.a) && r.a.length > 0, r.q);
    for (const a of r.a) { assert.equal(typeof a, 'string'); assert.ok(normalizeAnswer(a), `đáp án rỗng: ${r.q}`); assert.ok(a.length <= 60); }
    assert.equal(typeof r.hint, 'string'); assert.ok(r.hint.trim(), r.q);
    const k = normalizeAnswer(r.q);
    assert.ok(!seen.has(k), `trùng câu: ${r.q}`);
    seen.add(k);
    // gợi ý không được chứa nguyên đáp án chính
    assert.ok(!` ${normalizeAnswer(r.hint)} `.includes(` ${normalizeAnswer(r.a[0])} `), `gợi ý lộ đáp án: ${r.q}`);
  }
  assert.equal(loadRiddles().length, raw.length);
});

const RIDDLES = [
  { q: 'Câu 1?', a: ['con cua'], hint: 'gợi ý 1' },
  { q: 'Câu 2?', a: ['cái lược'], hint: 'gợi ý 2' },
  { q: 'Câu 3?', a: ['quả nhãn'], hint: 'gợi ý 3' },
];

test('vòng chơi: hỏi → gợi ý → lộ đáp án → câu tiếp → bảng điểm → ván mới', () => {
  let t = 0;
  const g = createRiddle({ riddles: RIDDLES, now: () => t, rand: () => 0.3 });
  assert.equal(g.s.phase, 'idle');
  assert.ok(g.start());
  assert.ok(!g.start());                         // đang chơi thì không bắt đầu lại
  assert.equal(g.s.phase, 'ask'); assert.equal(g.s.round, 1);
  let v = riddleView(g, () => 'x', t);
  assert.equal(v.answer, null); assert.equal(v.hint, null); assert.equal(v.mask, null);
  assert.ok(!JSON.stringify(v).includes(g.s.current.a[0]));
  t = HINT1_MS; assert.equal(g.tick(), 'hint');
  v = riddleView(g, () => 'x', t);
  assert.ok(v.hint); assert.equal(v.mask, null); assert.equal(v.answer, null);
  t = HINT2_MS; g.tick();
  v = riddleView(g, () => 'x', t);
  assert.ok(v.mask); assert.equal(v.answer, null);
  assert.ok(!JSON.stringify(v).includes(normalizeAnswer(g.s.current.a[0])));
  t = ASK_MS; assert.equal(g.tick(), 'reveal');
  v = riddleView(g, () => 'x', t);
  assert.equal(v.answer, g.s.current.a[0]);
  t += REVEAL_MS; assert.equal(g.tick(), 'next');
  assert.equal(g.s.round, 2);
  for (let r = 2; r <= ROUNDS; r++) {
    t += ASK_MS; g.tick(); t += REVEAL_MS;
    assert.equal(g.tick(), r === ROUNDS ? 'over' : 'next');
  }
  assert.equal(g.s.phase, 'over');
  t += OVER_MS; assert.equal(g.tick(false), null); // không còn ai thì không tự chơi
  assert.equal(g.tick(true), 'restart');
  assert.equal(g.s.round, 1);
});

test('trả lời: đúng được điểm, sai chỉ báo chưa đúng, giới hạn 8 lần, không đoán lại khi đã đúng', () => {
  let t = 0;
  const g = createRiddle({ riddles: RIDDLES, now: () => t, rand: () => 0 });
  assert.equal(g.answer('a', 'x').ok, false);    // chưa bắt đầu
  g.start();
  const ans = g.s.current.a[0];
  for (let k = 0; k < MAX_GUESSES; k++) assert.equal(g.answer('b', 'sai bét').correct, false);
  assert.equal(g.answer('b', ans).reason, 'limit');
  t = 5000;
  const r = g.answer('a', `  ${ans.toUpperCase()}  `);
  assert.ok(r.correct); assert.equal(r.pts, pointsFor(5000));
  assert.equal(g.answer('a', ans).reason, 'solved');
  assert.equal(g.s.scores.a, r.pts);
  // rác
  for (const junk of [null, 5, {}, [], '', '   ']) assert.equal(g.answer('c', junk).ok, false);
  assert.equal(g.answer('c', 'x'.repeat(10_000)).correct, false);   // cắt còn 60 ký tự
  // mọi người đã đúng → lộ sớm
  assert.ok(!g.revealIfAll(['a', 'b']));
  assert.ok(g.revealIfAll(['a']));
  assert.equal(g.s.phase, 'reveal');
});

test('kết thúc ván: người cao điểm nhất thắng; rời phòng xóa điểm', () => {
  let t = 0;
  const g = createRiddle({ riddles: RIDDLES, now: () => t, rand: () => 0.5 });
  g.start();
  g.answer('a', g.s.current.a[0]);
  t = 1000; g.answer('b', g.s.current.a[0]);
  for (let r = 1; r <= ROUNDS; r++) { t += ASK_MS; g.tick(); t += REVEAL_MS; g.tick(); }
  assert.equal(g.s.phase, 'over');
  assert.deepEqual(g.s.winners, ['a']);
  g.leave('a');
  assert.deepEqual(g.s.winners, []);
  assert.equal(g.s.scores.a, undefined);
});
