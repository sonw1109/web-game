// 🤖 AI Cờ Vua: negamax alpha-beta (đào sâu dần tới độ sâu 3) + tìm kiếm tĩnh các nước ăn quân,
// đánh giá = vật chất + bảng vị trí đơn giản. Có giới hạn thời gian để không chặn event loop lâu.
import { legalMoves, applyMove, inCheck } from '../rooms/chess.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;

// Bảng vị trí nhìn từ phía Trắng (ô 0 = a8). Quân đen dùng ô lật hàng: sq ^ 56.
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20],
  // Tàn cuộc: vua nên ra giữa bàn
  kEnd: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50],
};

/** Điểm thế cờ theo góc nhìn bên tới lượt (dương = bên tới lượt hơn). */
export function evaluate(pos) {
  const b = pos.board;
  let score = 0, heavy = 0;
  for (let sq = 0; sq < 64; sq++) { const p = b[sq]; if (p && p !== 'k' && p !== 'K' && p.toLowerCase() !== 'p') heavy += VAL[p.toLowerCase()]; }
  const endgame = heavy <= 1300;
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq];
    if (!p) continue;
    const k = p.toLowerCase();
    const white = p !== k;
    const table = k === 'k' && endgame ? PST.kEnd : PST[k];
    const v = VAL[k] + table[white ? sq : sq ^ 56];
    score += white ? v : -v;
  }
  return pos.turn === 'w' ? score : -score;
}

const TIMEOUT = Symbol('timeout');
const order = (moves, first) => {
  const key = (m) => (first && m.from === first.from && m.to === first.to && m.promo === first.promo ? 1e6 : 0)
    + (m.cap ? 10 * VAL[m.cap.toLowerCase()] + 1000 : 0) + (m.promo ? VAL[m.promo] : 0);
  return moves.map((m) => [key(m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
};

/**
 * Chọn nước đi tốt nhất. Trả { from, to, promo, score } hoặc null nếu hết nước.
 * timeMs: ngân sách thời gian (luôn hoàn thành ít nhất độ sâu 1) · rand: để xáo các nước ngang điểm.
 */
export function bestMove(pos, { timeMs = 300, maxDepth = 3, rand = Math.random, now = Date.now } = {}) {
  let root = legalMoves(pos);
  if (!root.length) return null;
  // Xáo trước khi sắp (sort ổn định) → các nước ngang điểm được chọn ngẫu nhiên, bot đỡ nhàm
  for (let i = root.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [root[i], root[j]] = [root[j], root[i]]; }
  const deadline = now() + timeMs;
  let nodes = 0, armed = false; // độ sâu 1 luôn chạy trọn, từ độ sâu 2 mới cắt theo giờ
  const check = () => { if (armed && (++nodes & 255) === 0 && now() > deadline) throw TIMEOUT; };

  function quiesce(p, alpha, beta, qd) {
    check();
    const stand = evaluate(p);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd <= 0) return stand;
    const caps = legalMoves(p).filter((m) => m.cap || m.promo);
    for (const m of order(caps)) {
      const v = -quiesce(applyMove(p, m), -beta, -alpha, qd - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }
  function search(p, depth, alpha, beta, ply) {
    check();
    const moves = legalMoves(p);
    if (!moves.length) return inCheck(p) ? -MATE + ply : 0;
    if (p.half >= 100) return 0;
    if (depth <= 0) return quiesce(p, alpha, beta, 4);
    let best = -Infinity;
    for (const m of order(moves)) {
      const v = -search(applyMove(p, m), depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = { ...pick(root[0]), score: evaluate(pos) };
  for (let depth = 1; depth <= maxDepth; depth++) {
    armed = depth > 1;
    if (armed && now() > deadline) break;
    try {
      let alpha = -Infinity, bestHere = null;
      for (const m of order(root, best)) {
        const v = -search(applyMove(pos, m), depth - 1, -Infinity, -alpha, 1);
        if (!bestHere || v > alpha) { alpha = v; bestHere = { ...pick(m), score: v }; }
      }
      best = bestHere;
      if (best.score >= MATE - 100) break; // đã thấy chiếu hết
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break; // hết giờ: giữ kết quả của độ sâu trước
    }
  }
  return best;
}
const pick = (m) => ({ from: m.from, to: m.to, promo: m.promo });
