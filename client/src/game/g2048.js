// 🔷 2048 – logic thuần, TẤT ĐỊNH (dùng chung client + server).
// Client chơi ngay tại máy; server chơi lại đúng các nước đó với cùng trạng thái RNG → điểm server là chuẩn.
export const N = 4;
export const DIRS = ['up', 'down', 'left', 'right'];

/** 1 bước mulberry32: trả về [số thực 0..1, trạng thái RNG mới]. Trạng thái là uint32 → dễ gửi qua mạng. */
export function rngNext(a) {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Sinh 1 ô mới (2: 90%, 4: 10%) vào ô trống theo RNG. Sửa `board` tại chỗ, trả {i, v, rng} hoặc null. */
function spawn(board, rng) {
  const empty = [];
  for (let i = 0; i < board.length; i++) if (!board[i]) empty.push(i);
  if (!empty.length) return null;
  let r;
  [r, rng] = rngNext(rng);
  const i = empty[Math.floor(r * empty.length)];
  [r, rng] = rngNext(rng);
  const v = r < 0.9 ? 2 : 4;
  board[i] = v;
  return { i, v, rng };
}

/** Ván mới từ seed (số nguyên bất kỳ). */
export function newGame(seed) {
  const board = new Array(N * N).fill(0);
  let rng = (Number(seed) >>> 0);
  for (let k = 0; k < 2; k++) rng = spawn(board, rng).rng;
  return { board, score: 0, rng, moves: 0, over: false };
}

/** Các hàng theo hướng đi: mỗi hàng là 4 chỉ số ô, phần tử đầu là mép mà các ô trượt về. */
function lines(dir) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const line = [];
    for (let j = 0; j < N; j++) {
      if (dir === 'left') line.push(k * N + j);
      else if (dir === 'right') line.push(k * N + (N - 1 - j));
      else if (dir === 'up') line.push(j * N + k);
      else line.push((N - 1 - j) * N + k);
    }
    out.push(line);
  }
  return out;
}

/** Trượt + gộp 1 dãy giá trị (về phía chỉ số 0). Mỗi ô chỉ gộp 1 lần mỗi nước. */
export function slideLine(vals) {
  const src = [];
  vals.forEach((v, j) => { if (v) src.push({ v, j }); });
  const out = new Array(vals.length).fill(0);
  const moves = []; // { from: j nguồn, to: j đích, merge }
  let gained = 0, pos = 0;
  for (let k = 0; k < src.length; k++) {
    const a = src[k], b = src[k + 1];
    if (b && b.v === a.v) {
      out[pos] = a.v * 2; gained += a.v * 2;
      moves.push({ from: a.j, to: pos, merge: true }, { from: b.j, to: pos, merge: true });
      k++;
    } else {
      out[pos] = a.v;
      moves.push({ from: a.j, to: pos, merge: false });
    }
    pos++;
  }
  return { out, gained, moves };
}

export function canMove(board) {
  for (let i = 0; i < N * N; i++) {
    const v = board[i];
    if (!v) return true;
    if (i % N < N - 1 && board[i + 1] === v) return true;
    if (i + N < N * N && board[i + N] === v) return true;
  }
  return false;
}

/**
 * Đi 1 nước. Không sửa `state` cũ.
 * → { state, moved, gained, moves: [{from, to, merge}] (chỉ số ô), spawn: {i, v} | null }
 * Nước không làm bảng đổi → moved=false, không sinh ô, không tính nước.
 */
export function move(state, dir) {
  if (!state || state.over || !DIRS.includes(dir)) return { state, moved: false, gained: 0, moves: [], spawn: null };
  const board = state.board.slice();
  const moves = [];
  let gained = 0, moved = false;
  for (const line of lines(dir)) {
    const r = slideLine(line.map((i) => state.board[i]));
    r.out.forEach((v, j) => { board[line[j]] = v; });
    for (const m of r.moves) {
      moves.push({ from: line[m.from], to: line[m.to], merge: m.merge });
      if (m.from !== m.to) moved = true;
    }
    if (r.moves.some((m) => m.merge)) moved = true;
    gained += r.gained;
  }
  if (!moved) return { state, moved: false, gained: 0, moves: [], spawn: null };
  const sp = spawn(board, state.rng);
  const next = {
    board,
    score: state.score + gained,
    rng: sp ? sp.rng : state.rng,
    moves: state.moves + 1,
    over: false,
  };
  next.over = !canMove(board);
  return { state: next, moved: true, gained, moves, spawn: sp && { i: sp.i, v: sp.v } };
}

export const maxTile = (board) => board.reduce((m, v) => Math.max(m, v), 0);
