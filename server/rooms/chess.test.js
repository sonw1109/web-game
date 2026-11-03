import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromFEN, initialPosition, legalMoves, applyMove, perft, toSAN, insufficientMaterial,
  createChess, chessView, parseMove, INIT_MS, INC_MS,
} from './chess.js';
import { bestMove } from '../bots/chessAI.js';

/** 'e2' → số ô 0–63 */
const sq = (n) => (8 - +n[1]) * 8 + 'abcdefgh'.indexOf(n[0]);
const mv = (a, b, promo) => ({ from: sq(a), to: sq(b), ...(promo ? { promo } : {}) });
const has = (pos, a, b) => legalMoves(pos).some((m) => m.from === sq(a) && m.to === sq(b));

test('vị trí đầu: 20 nước, perft 3 = 8902', () => {
  const p = initialPosition();
  assert.equal(legalMoves(p).length, 20);
  assert.equal(perft(p, 2), 400);
  assert.equal(perft(p, 3), 8902);
});

test('perft vị trí "Kiwipete" (nhập thành, bắt qua đường, phong cấp) và vị trí 3', () => {
  const kiwi = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(kiwi, 1), 48);
  assert.equal(perft(kiwi, 2), 2039);
  const p3 = fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(p3, 1), 14);
  assert.equal(perft(p3, 2), 191);
  assert.equal(perft(p3, 3), 2812);
});

test('nhập thành: 2 bên được phép, không qua ô bị chiếu, mất quyền khi vua/xe đã đi', () => {
  const p = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(has(p, 'e1', 'g1')); assert.ok(has(p, 'e1', 'c1'));
  const after = applyMove(p, mv('e1', 'g1'));
  assert.equal(after.board[sq('f1')], 'R'); assert.equal(after.board[sq('h1')], ''); assert.equal(after.board[sq('g1')], 'K');
  assert.equal(after.castling, 'kq');
  // Xe đen ở f8 khống chế f1 → không nhập thành cánh vua
  assert.ok(!has(fromFEN('r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1'), 'e1', 'g1'));
  // Đang bị chiếu thì không nhập thành
  assert.ok(!has(fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'.replace('8/8/8/8/8/8', '8/8/8/8/4r3/8')), 'e1', 'c1'));
  // Ô b1 bị khống chế vẫn được nhập thành cánh hậu (vua không đi qua b1), nhưng b1 có quân thì không
  assert.ok(has(fromFEN('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1'), 'e1', 'c1'));
  assert.ok(!has(fromFEN('4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1'), 'e1', 'c1'));
  // Xe đi rồi quay lại → mất quyền
  let q = applyMove(p, mv('h1', 'h2')); q = applyMove(q, mv('a8', 'a7')); q = applyMove(q, mv('h2', 'h1')); q = applyMove(q, mv('a7', 'a8'));
  assert.ok(!has(q, 'e1', 'g1')); assert.ok(has(q, 'e1', 'c1'));
});

test('bắt tốt qua đường: chỉ ngay nước sau, bỏ tốt bị bắt khỏi bàn', () => {
  let p = fromFEN('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  p = applyMove(p, mv('d7', 'd5'));
  assert.equal(p.ep, sq('d6'));
  assert.ok(has(p, 'e5', 'd6'));
  const ep = legalMoves(p).find((m) => m.from === sq('e5') && m.to === sq('d6'));
  const after = applyMove(p, ep);
  assert.equal(after.board[sq('d5')], ''); assert.equal(after.board[sq('d6')], 'P');
  assert.equal(toSAN(p, ep), 'exd6');
  // Để qua 1 nước thì hết quyền
  const late = applyMove(applyMove(p, mv('e1', 'e2')), mv('e8', 'e7'));
  assert.ok(!has(late, 'e5', 'd6'));
});

test('phong cấp: 4 lựa chọn, mặc định hậu, ván cờ nhận promo từ client', () => {
  const p = fromFEN('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  const promos = legalMoves(p).filter((m) => m.from === sq('a7')).map((m) => m.promo).sort();
  assert.deepEqual(promos, ['b', 'n', 'q', 'r']);
  assert.equal(applyMove(p, mv('a7', 'a8', 'n')).board[sq('a8')], 'N');
  const g = createChess(() => 0);
  g.sit('a', 'w'); g.sit('b', 'b');
  g.s.pos = p; g.s.legal = legalMoves(p);
  assert.ok(g.move('a', { from: sq('a7'), to: sq('a8') }));
  assert.equal(g.s.pos.board[sq('a8')], 'Q');
  assert.equal(g.s.history.at(-1), 'a8=Q');
});

test("chiếu hết kiểu Scholar's mate, SAN đúng, đếm ván thắng", () => {
  let t = 0;
  const g = createChess(() => t);
  assert.ok(g.sit('a', 'w')); assert.ok(!g.sit('a', 'b')); assert.ok(g.sit('b', 'b'));
  assert.equal(g.s.status, 'playing');
  assert.ok(!g.move('b', mv('e7', 'e5')));  // chưa tới lượt đen
  for (const [who, a, b] of [['a', 'e2', 'e4'], ['b', 'e7', 'e5'], ['a', 'f1', 'c4'], ['b', 'b8', 'c6'], ['a', 'd1', 'h5'], ['b', 'g8', 'f6'], ['a', 'h5', 'f7']]) {
    t += 1000;
    assert.ok(g.move(who, mv(a, b)), `${a}-${b}`);
  }
  assert.equal(g.s.status, 'over'); assert.equal(g.s.winner, 'w'); assert.equal(g.s.reason, 'chiếu hết');
  assert.deepEqual(g.s.history, ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']);
  assert.equal(g.s.wins.a, 1);
  assert.deepEqual(g.s.captured.w, ['p']);
  const v = chessView(g, (id) => id.toUpperCase());
  assert.equal(v.seats.w.name, 'A'); assert.deepEqual(v.legal, {});
  // Đồng hồ: trắng đi 4 nước mỗi nước 1 giây (+3 giây cộng thêm)
  assert.equal(g.s.clock.w, INIT_MS - 4000 + 4 * INC_MS);
  assert.ok(g.rematch('b')); assert.equal(g.s.status, 'playing'); assert.equal(g.s.history.length, 0);
});

test('hết nước đi (pat) = hòa; thiếu quân = hòa', () => {
  const g = createChess(() => 0);
  g.sit('a', 'w'); g.sit('b', 'b');
  g.s.pos = fromFEN('k7/8/1Q6/8/8/8/8/7K w - - 0 1'); g.s.legal = legalMoves(g.s.pos);
  assert.ok(g.move('a', mv('b6', 'c7')));
  assert.equal(g.s.winner, 'draw'); assert.match(g.s.reason, /pat/);
  assert.ok(insufficientMaterial(fromFEN('k7/8/8/8/8/8/8/6NK w - - 0 1').board));
  assert.ok(insufficientMaterial(fromFEN('kb6/8/8/8/8/8/8/6BK w - - 0 1').board));   // 2 tượng cùng màu ô
  assert.ok(!insufficientMaterial(fromFEN('k1b5/8/8/8/8/8/8/6BK w - - 0 1').board)); // tượng khác màu ô
  assert.ok(!insufficientMaterial(fromFEN('k7/8/8/8/8/8/8/5RK1 w - - 0 1').board));
});

test('lặp lại 3 lần = hòa; luật 50 nước = hòa', () => {
  const g = createChess(() => 0);
  g.sit('a', 'w'); g.sit('b', 'b');
  const loop = [['a', 'g1', 'f3'], ['b', 'g8', 'f6'], ['a', 'f3', 'g1'], ['b', 'f6', 'g8']];
  for (let k = 0; k < 2; k++) for (const [w, a, b] of loop) assert.ok(g.move(w, mv(a, b)));
  assert.equal(g.s.winner, 'draw'); assert.match(g.s.reason, /lặp/);

  const h = createChess(() => 0);
  h.sit('a', 'w'); h.sit('b', 'b');
  h.s.pos = fromFEN('k7/8/8/8/8/8/8/R6K w - - 99 80'); h.s.legal = legalMoves(h.s.pos);
  assert.ok(h.move('a', mv('a1', 'b1')));
  assert.equal(h.s.winner, 'draw'); assert.match(h.s.reason, /50/);
});

test('đồng hồ hết giờ → thua; rời ghế khi đang chơi → thua; xin hòa / đồng ý', () => {
  let t = 0;
  const g = createChess(() => t);
  g.sit('a', 'w'); g.sit('b', 'b');
  t = INIT_MS - 1; assert.ok(!g.tick());
  t = INIT_MS + 1; assert.ok(g.tick());
  assert.equal(g.s.winner, 'b'); assert.equal(g.s.reason, 'hết giờ');

  const h = createChess(() => 0);
  h.sit('a', 'w'); h.sit('b', 'b');
  assert.ok(h.offerDraw('a')); assert.ok(!h.offerDraw('a')); assert.ok(!h.acceptDraw('a'));
  assert.ok(h.acceptDraw('b')); assert.equal(h.s.winner, 'draw');
  assert.ok(h.rematch('a'));
  assert.ok(h.leave('b')); assert.equal(h.s.winner, 'w'); assert.equal(h.s.seats.b, null);
  assert.ok(!h.rematch('a')); // thiếu người
  assert.ok(h.swap('a')); assert.equal(h.s.seats.b, 'a');
});

test('dữ liệu rác vào move/sit không throw và bị từ chối', () => {
  const g = createChess(() => 0);
  g.sit('a', 'w'); g.sit('b', 'b');
  const junk = [null, undefined, 0, 12, 'e2e4', [], [52, 36], {}, { from: '52', to: '36' }, { from: 52.5, to: 36 },
    { from: -1, to: 36 }, { from: 52, to: 64 }, { from: 52, to: 36, promo: 'k' }, { from: 52, to: 36, promo: {} },
    { from: 52, to: 52 }, { from: 1e9, to: NaN }, { __proto__: { from: 52, to: 36 } }, new Array(1e5).fill(1),
    { from: 12, to: 28 }, { from: sq('e2'), to: sq('e5') }, true, () => 1];
  for (const j of junk) assert.equal(g.move('a', j), false, JSON.stringify(j) ?? String(j));
  for (const j of [null, 'x', 'W', 5, {}, [], 'constructor', '__proto__']) assert.equal(g.sit('c', j), false);
  assert.ok(!g.move('zzz', mv('e2', 'e4'))); // khán giả không đi được
  assert.equal(parseMove({ from: 52, to: 36, promo: 'q' }).promo, 'q');
  assert.ok(g.move('a', { from: sq('e2'), to: sq('e4'), promo: 'n' })); // promo thừa bị bỏ qua
});

test('AI: luôn trả nước hợp lệ, bắt hậu treo, thấy chiếu hết 1 nước', () => {
  let rng = 1;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  // Tự đánh với chính nó vài chục nửa nước – mọi nước đều hợp lệ
  let p = initialPosition();
  for (let i = 0; i < 24; i++) {
    const m = bestMove(p, { timeMs: 40, rand });
    if (!m) break;
    const legal = legalMoves(p).find((o) => o.from === m.from && o.to === m.to && (!o.promo || o.promo === m.promo));
    assert.ok(legal, `nước ${i} hợp lệ`);
    p = applyMove(p, legal);
  }
  const hang = fromFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  assert.deepEqual([bestMove(hang, { rand }).from, bestMove(hang, { rand }).to], [sq('d1'), sq('d5')]);
  const hang2 = fromFEN('rnb1kbnr/pppp1ppp/8/4p1q1/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3');
  const m2 = bestMove(hang2, { rand });
  assert.deepEqual([m2.from, m2.to], [sq('c1'), sq('g5')]);
  const mate = fromFEN('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  const m3 = bestMove(mate, { rand });
  assert.deepEqual([m3.from, m3.to], [sq('h5'), sq('f7')]);
  // Giới hạn thời gian được tôn trọng (thêm chút dư cho độ sâu 1)
  const t0 = Date.now(); bestMove(fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), { timeMs: 300 });
  assert.ok(Date.now() - t0 < 900, `mất ${Date.now() - t0}ms`);
  assert.equal(bestMove(fromFEN('k7/1Q6/2K5/8/8/8/8/8 b - - 0 1')), null); // bị chiếu hết, không còn nước
});
