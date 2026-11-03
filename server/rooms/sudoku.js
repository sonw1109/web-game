// 🔢 Sudoku Hợp Sức – cả phòng cùng giải 1 bảng. Điền đúng +10, sai -5. Lời giải chỉ nằm ở server.
import { reply, rateLimiter } from '../world.js';

export const DIFFS = { easy: { label: 'Dễ', clues: 38 }, medium: { label: 'Vừa', clues: 30 }, hard: { label: 'Khó', clues: 25 } };
export const RIGHT_PTS = 10, WRONG_PTS = -5;
export const IDLE_NEW_MS = 10_000;   // đang giải dở: phải 10 giây không ai điền mới được đổi bảng
const COLORS = ['#ff8a4c', '#4cc3ff', '#3ddc97', '#c78bff', '#ffd24c', '#ff6fa8', '#7ef0e0', '#b8e05a'];

const box = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
const shuffle = (arr, rand) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
const bits = (m) => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };

/**
 * Đếm số nghiệm (dừng khi đạt `limit`). Trả -1 nếu vượt quá `maxSteps` bước (coi như không chắc).
 * grid: mảng 81 số (0 = trống). Không sửa grid gốc.
 * rand: nếu có thì thử chữ số theo thứ tự ngẫu nhiên và ghi nghiệm đầu tiên vào `out`.
 */
export function solve(grid, { limit = 2, maxSteps = 50_000, rand = null, out = null } = {}) {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = g[i];
    if (!v) continue;
    const r = Math.floor(i / 9), c = i % 9, b = box(r, c), m = 1 << v;
    if ((rows[r] | cols[c] | boxes[b]) & m) return 0; // đề tự mâu thuẫn
    rows[r] |= m; cols[c] |= m; boxes[b] |= m;
  }
  let count = 0, steps = 0, aborted = false;
  const FULL = 0b1111111110;
  const rec = () => {
    if (++steps > maxSteps) { aborted = true; return; }
    // chọn ô trống ít lựa chọn nhất (MRV)
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const r = Math.floor(i / 9), c = i % 9;
      const mask = FULL & ~(rows[r] | cols[c] | boxes[box(r, c)]);
      let n = 0; for (let x = mask; x; x &= x - 1) n++;
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i]; return; }
    if (!bestN) return;
    const r = Math.floor(best / 9), c = best % 9, b = box(r, c);
    const digits = bits(bestMask);
    if (rand) shuffle(digits, rand);
    for (const d of digits) {
      const m = 1 << d;
      g[best] = d; rows[r] |= m; cols[c] |= m; boxes[b] |= m;
      rec();
      g[best] = 0; rows[r] &= ~m; cols[c] &= ~m; boxes[b] &= ~m;
      if (count >= limit || aborted) return;
    }
  };
  rec();
  return aborted ? -1 : count;
}

/** Kiểm tra lời giải đầy đủ hợp lệ. */
export function isValidSolution(sol) {
  if (!Array.isArray(sol) || sol.length !== 81) return false;
  for (let k = 0; k < 9; k++) {
    const r = new Set(), c = new Set(), b = new Set();
    for (let j = 0; j < 9; j++) {
      r.add(sol[k * 9 + j]); c.add(sol[j * 9 + k]);
      b.add(sol[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]);
    }
    for (const s of [r, c, b]) if (s.size !== 9 || [...s].some((v) => !(v >= 1 && v <= 9))) return false;
  }
  return true;
}

/** Sinh đề: { puzzle (0 = trống), solution }. Thử vài lần (≤ ~120ms) để gần số gợi ý mục tiêu nhất. */
export function generate(diff = 'medium', rand = Math.random) {
  const target = (DIFFS[diff] || DIFFS.medium).clues;
  const t0 = Date.now();
  let best = null;
  for (let k = 0; k < 12; k++) {
    const g = generateOnce(target, rand);
    const n = g.puzzle.filter(Boolean).length;
    if (!best || n < best.n) best = { ...g, n };
    if (n <= target || Date.now() - t0 > 120) break;
  }
  return { puzzle: best.puzzle, solution: best.solution };
}

function generateOnce(target, rand) {
  const solution = new Array(81).fill(0);
  solve(new Array(81).fill(0), { limit: 1, rand, out: solution, maxSteps: 100_000 });
  const puzzle = solution.slice();
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rand)) {
    if (clues <= target) break;
    const v = puzzle[i];
    puzzle[i] = 0;
    if (solve(puzzle, { limit: 2, maxSteps: 4000 }) !== 1) puzzle[i] = v; // không duy nhất / quá lâu → giữ lại
    else clues--;
  }
  return { puzzle, solution };
}

/** Phần lõi (không socket) để test. */
export function createSudoku({ now = Date.now, rand = Math.random } = {}) {
  const s = {
    round: 0, diff: 'medium', status: 'playing',
    givens: [], board: [], solution: [],
    by: [],                         // ai điền ô i (id) – null với ô đề cho sẵn / ô trống
    scores: new Map(),              // id → { name, pts, right, wrong, color }
    startedAt: 0, finishedAt: 0, lastFillAt: 0,
    winners: [],
  };
  const reset = (diff) => {
    const { puzzle, solution } = generate(DIFFS[diff] ? diff : 'medium', rand);
    s.round++; s.diff = DIFFS[diff] ? diff : 'medium'; s.status = 'playing';
    s.givens = puzzle.map(Boolean); s.board = puzzle.slice(); s.solution = solution;
    s.by = new Array(81).fill(null);
    s.scores = new Map();
    s.startedAt = now(); s.finishedAt = 0; s.lastFillAt = now(); s.winners = [];
  };
  reset('easy');

  const entry = (id, name) => {
    let e = s.scores.get(id);
    if (!e) { e = { name: String(name ?? '?'), pts: 0, right: 0, wrong: 0, color: COLORS[s.scores.size % COLORS.length] }; s.scores.set(id, e); }
    return e;
  };

  return {
    s,
    /** → { ok, right, done } hoặc { ok:false, error } */
    fill(id, name, arg) {
      if (s.status !== 'playing') return { ok: false, error: 'Bảng đã xong' };
      if (!arg || typeof arg !== 'object') return { ok: false, error: 'Sai dữ liệu' };
      const { i, v } = arg;
      if (!Number.isInteger(i) || i < 0 || i >= 81 || !Number.isInteger(v) || v < 1 || v > 9) return { ok: false, error: 'Sai dữ liệu' };
      if (s.board[i]) return { ok: false, error: 'Ô đã có số' };
      const e = entry(id, name);
      s.lastFillAt = now();
      if (s.solution[i] !== v) { e.pts += WRONG_PTS; e.wrong++; return { ok: true, right: false, i, v }; }
      s.board[i] = v; s.by[i] = id; e.pts += RIGHT_PTS; e.right++;
      const done = s.board.every(Boolean);
      if (done) {
        s.status = 'done'; s.finishedAt = now();
        const top = Math.max(...[...s.scores.values()].map((x) => x.pts));
        s.winners = [...s.scores].filter(([, x]) => x.pts === top && top > 0).map(([wid]) => wid);
      }
      return { ok: true, right: true, i, v, done };
    },
    canNew() { return s.status === 'done' || now() - s.lastFillAt >= IDLE_NEW_MS; },
    newGame(diff) {
      if (!this.canNew()) return false;
      reset(typeof diff === 'string' && DIFFS[diff] ? diff : s.diff);
      return true;
    },
    /** Dữ liệu gửi xuống client – TUYỆT ĐỐI không có lời giải. */
    view() {
      const ids = [...s.scores.keys()];
      return {
        round: s.round, diff: s.diff, status: s.status,
        board: s.board.slice(),
        givens: s.givens.map((g) => (g ? 1 : 0)),
        by: s.by.map((id) => (id ? ids.indexOf(id) : -1)),
        players: [...s.scores].map(([id, e]) => ({ id, name: e.name, pts: e.pts, right: e.right, wrong: e.wrong, color: e.color })),
        winners: s.winners.slice(),
        elapsedMs: (s.finishedAt || now()) - s.startedAt,
        newInMs: s.status === 'done' ? 0 : Math.max(0, IDLE_NEW_MS - (now() - s.lastFillAt)),
      };
    },
  };
}

export function register(io, world, arcade) {
  const game = createSudoku();
  const ROOM = 'room:sudoku';
  const here = (id) => world.get(id)?.room === 'sudoku';
  const fillLimit = rateLimiter(8, 2000);
  const newLimit = rateLimiter(3, 10_000);
  const syncLimit = rateLimiter(10, 5000);
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  const broadcast = () => io.to(ROOM).emit('sudoku:state', game.view());

  io.on('connection', (socket) => {
    socket.on('sudoku:sync', () => { if (here(socket.id) && syncLimit(socket.id)) socket.emit('sudoku:state', game.view()); });

    socket.on('sudoku:fill', (arg, ack) => {
      const p = world.get(socket.id);
      if (p?.room !== 'sudoku') return reply(ack, { ok: false });
      if (!fillLimit(socket.id)) return reply(ack, { ok: false, error: 'Chậm lại chút' });
      const r = game.fill(socket.id, p.name, arg);
      if (!r.ok) return reply(ack, r);
      arcade?.award('sudoku', socket.id, r.right ? RIGHT_PTS : WRONG_PTS);
      reply(ack, { ok: true, right: r.right, i: r.i, v: r.v });
      broadcast();
      if (r.done) {
        const s = game.s;
        for (const id of s.winners) arcade?.award('sudoku', id, 0, { win: true });
        const names = s.winners.map((id) => s.scores.get(id)?.name).filter(Boolean);
        const mins = Math.round((s.finishedAt - s.startedAt) / 60000);
        sys(`🔢 Sudoku: cả phòng giải xong bảng ${DIFFS[s.diff].label} sau ${mins} phút!${names.length ? ` 🏆 ${names.join(', ')} nhiều điểm nhất.` : ''}`);
      }
    });

    socket.on('sudoku:new', (diff, ack) => {
      const p = world.get(socket.id);
      if (p?.room !== 'sudoku') return reply(ack, { ok: false });
      if (!newLimit(socket.id)) return reply(ack, { ok: false, error: 'Chậm lại chút' });
      if (!game.newGame(diff)) return reply(ack, { ok: false, error: 'Đang có người giải – chờ 10 giây không ai điền' });
      reply(ack, { ok: true });
      broadcast();
      sys(`🔢 ${p.name} mở bảng Sudoku mới (${DIFFS[game.s.diff].label}).`);
    });
  });

  return { game };
}
