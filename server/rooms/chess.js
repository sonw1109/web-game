// ♟️ Cờ Vua – server là trọng tài: sinh nước đi hợp lệ, nhập thành, bắt tốt qua đường, phong cấp,
// chiếu hết / hết nước / thiếu quân / 50 nước / lặp 3 lần, đồng hồ 5 phút + 3 giây mỗi nước.
// Bàn cờ: mảng 64 ô, ô 0 = a8, ô 7 = h8, ô 56 = a1, ô 63 = h1 (hàng = sq >> 3, cột = sq & 7).
// Quân: chữ hoa = trắng (PNBRQK), chữ thường = đen (pnbrqk), '' = ô trống.
import { rateLimiter, reply } from '../world.js';
import { bestMove, evaluate } from '../bots/chessAI.js';

export const INIT_MS = 5 * 60_000;   // 5 phút mỗi bên
export const INC_MS = 3_000;         // +3 giây mỗi nước
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_HISTORY = 600;             // chặn ván dài vô hạn (luật 50 nước cũng chặn trước)

// ---------- Bảng tra sẵn ----------
const FILES = 'abcdefgh';
const rowOf = (sq) => sq >> 3, colOf = (sq) => sq & 7;
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isWhite = (p) => p !== '' && p === p.toUpperCase();
const colorOf = (p) => (p === '' ? null : isWhite(p) ? 'w' : 'b');
const other = (c) => (c === 'w' ? 'b' : 'w');
export const sqName = (sq) => FILES[colOf(sq)] + (8 - rowOf(sq));

function jumps(offsets) {
  const t = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rowOf(sq), c = colOf(sq);
    t.push(offsets.filter(([dr, dc]) => onBoard(r + dr, c + dc)).map(([dr, dc]) => (r + dr) * 8 + c + dc));
  }
  return t;
}
function rays(dirs) {
  const t = [];
  for (let sq = 0; sq < 64; sq++) {
    const r = rowOf(sq), c = colOf(sq);
    t.push(dirs.map(([dr, dc]) => {
      const ray = [];
      for (let k = 1; onBoard(r + dr * k, c + dc * k); k++) ray.push((r + dr * k) * 8 + c + dc * k);
      return ray;
    }));
  }
  return t;
}
const KNIGHT = jumps([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
const KING = jumps([[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);
const DIAG = rays([[-1, -1], [-1, 1], [1, -1], [1, 1]]);
const ORTHO = rays([[-1, 0], [1, 0], [0, -1], [0, 1]]);

// ---------- Vị trí ----------
/** Đọc FEN (dùng cho test & khởi tạo). Trả null nếu sai định dạng. */
export function fromFEN(fen) {
  if (typeof fen !== 'string') return null;
  const [placement, turn = 'w', castling = '-', ep = '-', half = '0', full = '1'] = fen.trim().split(/\s+/);
  const rows = placement.split('/');
  if (rows.length !== 8) return null;
  const board = [];
  for (const row of rows) {
    for (const ch of row) {
      if (/[1-8]/.test(ch)) for (let k = 0; k < +ch; k++) board.push('');
      else if (/[pnbrqkPNBRQK]/.test(ch)) board.push(ch);
      else return null;
    }
  }
  if (board.length !== 64) return null;
  const epSq = /^[a-h][36]$/.test(ep) ? (8 - +ep[1]) * 8 + FILES.indexOf(ep[0]) : -1;
  return {
    board, turn: turn === 'b' ? 'b' : 'w',
    castling: castling === '-' ? '' : castling.replace(/[^KQkq]/g, ''),
    ep: epSq, half: +half || 0, full: +full || 1,
  };
}
export const initialPosition = () => fromFEN(START_FEN);

/** Ô `sq` có bị bên `by` tấn công không. */
export function attacked(board, sq, by) {
  const r = rowOf(sq), c = colOf(sq);
  const W = by === 'w';
  // Tốt trắng đánh lên (hàng nhỏ hơn) → ô bị tốt trắng ở hàng r+1 tấn công
  const pr = W ? r + 1 : r - 1, pawn = W ? 'P' : 'p';
  if (pr >= 0 && pr < 8) {
    if (c > 0 && board[pr * 8 + c - 1] === pawn) return true;
    if (c < 7 && board[pr * 8 + c + 1] === pawn) return true;
  }
  const N = W ? 'N' : 'n', K = W ? 'K' : 'k', B = W ? 'B' : 'b', R = W ? 'R' : 'r', Q = W ? 'Q' : 'q';
  for (const t of KNIGHT[sq]) if (board[t] === N) return true;
  for (const t of KING[sq]) if (board[t] === K) return true;
  for (const ray of DIAG[sq]) for (const t of ray) { const p = board[t]; if (p) { if (p === B || p === Q) return true; break; } }
  for (const ray of ORTHO[sq]) for (const t of ray) { const p = board[t]; if (p) { if (p === R || p === Q) return true; break; } }
  return false;
}
export const kingSquare = (board, color) => board.indexOf(color === 'w' ? 'K' : 'k');
export function inCheck(pos, color = pos.turn) {
  const k = kingSquare(pos.board, color);
  return k >= 0 && attacked(pos.board, k, other(color));
}

/** Nước đi giả hợp lệ (chưa xét vua bị chiếu, trừ nhập thành đã xét đủ). */
function pseudoMoves(pos) {
  const { board, turn } = pos;
  const enemy = other(turn);
  const moves = [];
  const add = (from, to, extra) => moves.push(extra ? { from, to, ...extra } : { from, to });
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    const kind = p.toLowerCase();
    if (kind === 'p') {
      const dir = turn === 'w' ? -8 : 8;
      const startRow = turn === 'w' ? 6 : 1, lastRow = turn === 'w' ? 0 : 7;
      const r = rowOf(sq), c = colOf(sq);
      const pushPawn = (to, cap) => {
        if (rowOf(to) === lastRow) for (const promo of ['q', 'r', 'b', 'n']) add(sq, to, cap ? { promo, cap } : { promo });
        else add(sq, to, cap ? { cap } : null);
      };
      const one = sq + dir;
      if (board[one] === '') {
        pushPawn(one);
        if (r === startRow && board[one + dir] === '') add(sq, one + dir);
      }
      for (const dc of [-1, 1]) {
        if (c + dc < 0 || c + dc > 7) continue;
        const to = one + dc;
        if (board[to] && colorOf(board[to]) === enemy) pushPawn(to, board[to]);
        else if (to === pos.ep) add(sq, to, { cap: turn === 'w' ? 'p' : 'P', ep: true });
      }
    } else if (kind === 'n' || kind === 'k') {
      for (const to of (kind === 'n' ? KNIGHT : KING)[sq]) {
        const t = board[to];
        if (!t) add(sq, to);
        else if (colorOf(t) === enemy) add(sq, to, { cap: t });
      }
    } else {
      const dirs = kind === 'b' ? DIAG[sq] : kind === 'r' ? ORTHO[sq] : [...DIAG[sq], ...ORTHO[sq]];
      for (const ray of dirs) {
        for (const to of ray) {
          const t = board[to];
          if (!t) { add(sq, to); continue; }
          if (colorOf(t) === enemy) add(sq, to, { cap: t });
          break;
        }
      }
    }
  }
  // Nhập thành: vua & xe chưa đi (quyền còn), ô giữa trống, vua không đang bị chiếu / đi qua / tới ô bị chiếu
  const cr = pos.castling;
  const home = turn === 'w' ? 60 : 4;
  const K = turn === 'w' ? 'K' : 'k', R = turn === 'w' ? 'R' : 'r';
  if (cr && board[home] === K && !attacked(board, home, enemy)) {
    const kSide = turn === 'w' ? 'K' : 'k', qSide = turn === 'w' ? 'Q' : 'q';
    if (cr.includes(kSide) && board[home + 3] === R && !board[home + 1] && !board[home + 2]
      && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) add(home, home + 2, { castle: 'k' });
    if (cr.includes(qSide) && board[home - 4] === R && !board[home - 1] && !board[home - 2] && !board[home - 3]
      && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) add(home, home - 2, { castle: 'q' });
  }
  return moves;
}

const CASTLE_MASK = { 60: 'KQ', 63: 'K', 56: 'Q', 4: 'kq', 7: 'k', 0: 'q' };
/** Áp nước đi (đã biết là giả hợp lệ) → vị trí MỚI (không sửa vị trí cũ). */
export function applyMove(pos, m) {
  const b = pos.board.slice();
  const p = b[m.from];
  const white = isWhite(p);
  const kind = p.toLowerCase();
  let half = pos.half + 1, ep = -1;
  if (b[m.to]) half = 0;
  b[m.to] = p; b[m.from] = '';
  if (kind === 'p') {
    half = 0;
    if (m.ep || (m.to === pos.ep && colOf(m.to) !== colOf(m.from))) b[m.to + (white ? 8 : -8)] = '';
    if (Math.abs(m.to - m.from) === 16) {
      // Chỉ ghi ô bắt qua đường khi thật sự có tốt đối phương đứng cạnh (để so lặp vị trí cho đúng)
      const enemyPawn = white ? 'p' : 'P', c = colOf(m.to);
      if ((c > 0 && b[m.to - 1] === enemyPawn) || (c < 7 && b[m.to + 1] === enemyPawn)) ep = (m.from + m.to) / 2;
    }
    const lastRow = white ? 0 : 7;
    if (rowOf(m.to) === lastRow) {
      const promo = ['q', 'r', 'b', 'n'].includes(m.promo) ? m.promo : 'q';
      b[m.to] = white ? promo.toUpperCase() : promo;
    }
  } else if (kind === 'k' && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = ''; }
    else { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = ''; }
  }
  let castling = pos.castling;
  if (castling) for (const sq of [m.from, m.to]) { const lose = CASTLE_MASK[sq]; if (lose) castling = castling.replace(new RegExp(`[${lose}]`, 'g'), ''); }
  return { board: b, turn: other(pos.turn), castling, ep, half, full: pos.full + (pos.turn === 'b' ? 1 : 0) };
}

/** Mọi nước đi hợp lệ của bên tới lượt. */
export function legalMoves(pos) {
  const out = [];
  const me = pos.turn;
  for (const m of pseudoMoves(pos)) {
    const np = applyMove(pos, m);
    const k = kingSquare(np.board, me);
    if (k >= 0 && !attacked(np.board, k, other(me))) out.push(m);
  }
  return out;
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(pos, m), depth - 1);
  return n;
}

/** Hai bên đều không thể chiếu hết: K-K, K+N-K, K+B-K, chỉ còn tượng cùng màu ô. */
export function insufficientMaterial(board) {
  const rest = [];
  for (let sq = 0; sq < 64; sq++) { const p = board[sq]; if (p && p.toLowerCase() !== 'k') rest.push([p.toLowerCase(), sq]); }
  if (rest.length === 0) return true;
  if (rest.length === 1 && (rest[0][0] === 'n' || rest[0][0] === 'b')) return true;
  if (rest.every(([k]) => k === 'b')) {
    const shade = (sq) => (rowOf(sq) + colOf(sq)) & 1;
    return rest.every(([, sq]) => shade(sq) === shade(rest[0][1]));
  }
  return false;
}
/** Bên `color` còn đủ quân để (về lý thuyết) chiếu hết không – dùng khi đối phương hết giờ. */
function canMate(board, color) {
  const mine = board.filter((p) => p && colorOf(p) === color && p.toLowerCase() !== 'k').map((p) => p.toLowerCase());
  if (mine.length === 0) return false;
  if (mine.length === 1 && (mine[0] === 'n' || mine[0] === 'b')) return false;
  return true;
}

/** Ký hiệu SAN cơ bản: Nf3, exd5, O-O, e8=Q+, Qxf7#. `legal` = nước hợp lệ của vị trí trước. */
export function toSAN(pos, m, legal = legalMoves(pos)) {
  const p = pos.board[m.from];
  const kind = p.toLowerCase();
  let s;
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) s = m.to > m.from ? 'O-O' : 'O-O-O';
  else if (kind === 'p') {
    const cap = colOf(m.from) !== colOf(m.to);
    s = (cap ? `${FILES[colOf(m.from)]}x` : '') + sqName(m.to);
    if (m.promo) s += `=${m.promo.toUpperCase()}`;
  } else {
    const rivals = legal.filter((o) => o.to === m.to && o.from !== m.from && pos.board[o.from] === p);
    let dis = '';
    if (rivals.length) {
      if (!rivals.some((o) => colOf(o.from) === colOf(m.from))) dis = FILES[colOf(m.from)];
      else if (!rivals.some((o) => rowOf(o.from) === rowOf(m.from))) dis = String(8 - rowOf(m.from));
      else dis = sqName(m.from);
    }
    s = kind.toUpperCase() + dis + (pos.board[m.to] ? 'x' : '') + sqName(m.to);
  }
  const np = applyMove(pos, m);
  if (inCheck(np)) s += legalMoves(np).length ? '+' : '#';
  return s;
}

/** Khóa vị trí để đếm lặp: bàn cờ + lượt + quyền nhập thành + ô bắt qua đường. */
export const positionKey = (pos) => `${pos.board.map((p) => p || '.').join('')}${pos.turn}${pos.castling}${pos.ep}`;

/** Kiểm tra chặt dữ liệu nước đi từ client. Trả {from,to,promo} hoặc null. */
export function parseMove(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const own = (k) => (Object.hasOwn(m, k) ? m[k] : undefined);
  const from = own('from'), to = own('to'), promo = own('promo');
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63 || from === to) return null;
  if (promo !== undefined && promo !== null && !['q', 'r', 'b', 'n'].includes(promo)) return null;
  return { from, to, promo: promo || 'q' };
}

// ---------- Ván cờ (logic thuần, không socket) ----------
export function createChess(now = Date.now) {
  const s = {
    pos: initialPosition(),
    legal: [],
    seats: { w: null, b: null },       // socket id
    status: 'waiting',                 // waiting | playing | over
    winner: null,                      // 'w' | 'b' | 'draw'
    reason: '',
    lastMove: null,                    // { from, to }
    history: [],                       // SAN
    captured: { w: [], b: [] },        // quân mà bên trắng / đen đã ăn được
    clock: { w: INIT_MS, b: INIT_MS },
    turnStart: 0,
    drawOffer: null,                   // 'w' | 'b' | null
    offerPly: { w: -99, b: -99 },      // mỗi bên chỉ được xin hòa 1 lần mỗi lượt đi của mình
    reps: new Map(),                   // positionKey -> số lần
    wins: Object.create(null),         // id -> số ván thắng
    result: null,                      // { winner, w, b, plies } – ghi lại lúc kết thúc để trao điểm
  };
  s.legal = legalMoves(s.pos);

  const seatOf = (id) => (id && s.seats.w === id ? 'w' : id && s.seats.b === id ? 'b' : null);
  const elapsed = () => (s.status === 'playing' ? Math.max(0, now() - s.turnStart) : 0);
  const clockLeft = (c) => Math.max(0, s.clock[c] - (s.pos.turn === c ? elapsed() : 0));

  const reset = () => {
    s.pos = initialPosition();
    s.legal = legalMoves(s.pos);
    s.winner = null; s.reason = ''; s.lastMove = null; s.history = []; s.captured = { w: [], b: [] };
    s.clock = { w: INIT_MS, b: INIT_MS }; s.drawOffer = null; s.offerPly = { w: -99, b: -99 };
    s.reps = new Map([[positionKey(s.pos), 1]]); s.result = null;
    if (s.seats.w && s.seats.b) { s.status = 'playing'; s.turnStart = now(); }
    else { s.status = 'waiting'; s.turnStart = 0; }
  };
  const finish = (winner, reason) => {
    if (s.status === 'playing') s.clock[s.pos.turn] = clockLeft(s.pos.turn); // dừng đồng hồ
    s.status = 'over'; s.winner = winner; s.reason = reason; s.drawOffer = null;
    s.result = { winner, w: s.seats.w, b: s.seats.b, plies: s.history.length };
    if (winner === 'w' || winner === 'b') {
      const id = s.seats[winner];
      if (id) s.wins[id] = (s.wins[id] || 0) + 1;
    }
  };

  return {
    s, seatOf, clockLeft,
    sit(id, seat) {
      if (!['w', 'b'].includes(seat) || s.seats[seat] || seatOf(id) || s.status === 'playing') return false;
      s.seats[seat] = id;
      if (s.seats.w && s.seats.b) reset();
      return true;
    },
    /** Rời ghế (đứng dậy / rời phòng). Đang chơi thì xử thua. */
    leave(id) {
      const seat = seatOf(id);
      if (!seat) return false;
      if (s.status === 'playing') finish(other(seat), 'bỏ cuộc');
      s.seats[seat] = null;
      if (s.status !== 'over') s.status = 'waiting';
      return true;
    },
    move(id, raw) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat || seat !== s.pos.turn) return false;
      const want = parseMove(raw);
      if (!want) return false;
      const m = s.legal.find((o) => o.from === want.from && o.to === want.to && (!o.promo || o.promo === want.promo));
      if (!m) return false;
      // Đồng hồ: hết giờ trước khi đi thì thua luôn
      const left = s.clock[seat] - elapsed();
      if (left <= 0) { this.tick(); return true; }
      s.clock[seat] = left + INC_MS;

      const san = toSAN(s.pos, m, s.legal);
      if (m.cap) s.captured[seat].push(m.cap);
      s.pos = applyMove(s.pos, m);
      s.legal = legalMoves(s.pos);
      s.history.push(san);
      s.lastMove = { from: m.from, to: m.to };
      s.turnStart = now();
      if (s.drawOffer && s.drawOffer !== seat) s.drawOffer = null; // đi tiếp = từ chối lời mời hòa
      const key = positionKey(s.pos);
      const n = (s.reps.get(key) || 0) + 1;
      s.reps.set(key, n);

      if (!s.legal.length) finish(inCheck(s.pos) ? seat : 'draw', inCheck(s.pos) ? 'chiếu hết' : 'hết nước đi (pat)');
      else if (insufficientMaterial(s.pos.board)) finish('draw', 'không đủ quân chiếu hết');
      else if (s.pos.half >= 100) finish('draw', 'luật 50 nước');
      else if (n >= 3) finish('draw', 'lặp lại 3 lần');
      else if (s.history.length >= MAX_HISTORY) finish('draw', 'ván quá dài');
      return true;
    },
    surrender(id) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat) return false;
      finish(other(seat), 'đầu hàng');
      return true;
    },
    offerDraw(id) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat || s.drawOffer) return false;
      if (s.offerPly[seat] >= s.history.length - 1) return false; // chống spam: chờ qua 1 lượt
      s.drawOffer = seat; s.offerPly[seat] = s.history.length;
      return true;
    },
    acceptDraw(id) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat || !s.drawOffer || s.drawOffer === seat) return false;
      finish('draw', 'hai bên đồng ý hòa');
      return true;
    },
    declineDraw(id) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat || !s.drawOffer || s.drawOffer === seat) return false;
      s.drawOffer = null;
      return true;
    },
    rematch(id) {
      if (s.status !== 'over' || !seatOf(id) || !s.seats.w || !s.seats.b) return false;
      reset();
      return true;
    },
    swap(id) {
      if (s.status === 'playing' || !seatOf(id)) return false;
      [s.seats.w, s.seats.b] = [s.seats.b, s.seats.w];
      return true;
    },
    /** Gọi định kỳ: hết giờ → thua (hoặc hòa nếu đối phương không đủ quân chiếu hết). */
    tick() {
      if (s.status !== 'playing' || clockLeft(s.pos.turn) > 0) return false;
      const loser = s.pos.turn, winner = other(loser);
      s.clock[loser] = 0;
      if (canMate(s.pos.board, winner)) finish(winner, 'hết giờ');
      else finish('draw', 'hết giờ nhưng đối thủ không đủ quân chiếu hết');
      return true;
    },
  };
}

/** Dữ liệu gửi xuống client (không có gì cần giấu trong cờ vua). */
export function chessView(game, name = () => null) {
  const s = game.s;
  const legal = {};
  if (s.status === 'playing') for (const m of s.legal) (legal[m.from] ||= []).includes(m.to) || legal[m.from].push(m.to);
  const seat = (c) => s.seats[c] && { id: s.seats[c], name: name(s.seats[c]), wins: s.wins[s.seats[c]] || 0 };
  return {
    board: s.pos.board, turn: s.pos.turn, status: s.status, winner: s.winner, reason: s.reason,
    lastMove: s.lastMove, check: inCheck(s.pos) ? kingSquare(s.pos.board, s.pos.turn) : -1,
    legal, history: s.history, captured: s.captured,
    clocks: { w: game.clockLeft('w'), b: game.clockLeft('b') }, initMs: INIT_MS, incMs: INC_MS,
    drawOffer: s.drawOffer, half: s.pos.half,
    seats: { w: seat('w'), b: seat('b') },
  };
}

// ---------- Nối socket ----------
export function register(io, world, arcade) {
  const game = createChess();
  const ROOM = 'room:chess';
  const name = (id) => (id ? world.get(id)?.name ?? '?' : null);
  const view = () => chessView(game, name);
  const broadcast = () => io.to(ROOM).emit('chess:state', view());
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });

  /** Ván vừa kết thúc → thông báo + trao điểm Bảng Vàng. */
  const settle = () => {
    const s = game.s, r = s.result;
    if (s.status !== 'over' || !r) return;
    const label = { w: 'Trắng', b: 'Đen' };
    if (r.winner === 'draw') sys(`♟️ Cờ Vua: hòa (${s.reason}) 🤝`);
    else sys(`♟️ Cờ Vua: ${name(r[r.winner]) ?? label[r.winner]} (${label[r.winner]}) thắng – ${s.reason}! 🏆`);
    // Chống cày điểm: ván phải có ít nhất 4 nửa nước mới được tính điểm
    if (r.plies < 4 || !arcade?.award) return;
    if (r.winner === 'draw') { arcade.award('chess', r.w, 10, { win: false }); arcade.award('chess', r.b, 10, { win: false }); }
    else arcade.award('chess', r[r.winner], 30, { win: true });
  };

  const ACTIONS = {
    sit: (id, seat) => game.sit(id, seat),
    stand: (id) => game.leave(id),
    move: (id, m) => game.move(id, m),
    surrender: (id) => game.surrender(id),
    offerDraw: (id) => game.offerDraw(id),
    acceptDraw: (id) => game.acceptDraw(id),
    declineDraw: (id) => game.declineDraw(id),
    rematch: (id) => game.rematch(id),
    swap: (id) => game.swap(id),
  };
  /** Thực hiện 1 hành động (người thật qua socket, hoặc bot gọi trực tiếp). */
  function act(id, type, arg) {
    if (world.get(id)?.room !== 'chess' || !Object.hasOwn(ACTIONS, type)) return false;
    const before = game.s.status;
    let ok = false;
    try { ok = ACTIONS[type](id, arg); } catch (e) { console.error('[chess]', e); return false; }
    if (ok) {
      broadcast();
      if (before === 'playing' && game.s.status === 'over') settle();
      else if (type === 'offerDraw') sys(`♟️ ${name(id)} xin hòa 🤝`);
      else if (type === 'declineDraw') sys(`♟️ ${name(id)} từ chối hòa`);
    }
    return ok;
  }

  const limit = rateLimiter(30, 5_000);
  const syncLimit = rateLimiter(10, 5_000);
  io.on('connection', (socket) => {
    socket.on('chess:sync', () => {
      if (world.get(socket.id)?.room !== 'chess' || !syncLimit(socket.id)) return;
      socket.emit('chess:state', view());
    });
    for (const type of Object.keys(ACTIONS)) {
      socket.on(`chess:${type}`, (arg, ack) => {
        if (typeof arg === 'function' && ack === undefined) { ack = arg; arg = undefined; }
        if (world.get(socket.id)?.room !== 'chess' || !limit(socket.id)) return reply(ack, { ok: false });
        reply(ack, { ok: act(socket.id, type, arg) });
      });
    }
  });

  world.events.on('room', ({ p, prev }) => {
    if (prev !== 'chess' || !p) return;
    const wasPlaying = game.s.status === 'playing';
    if (game.leave(p.id)) { broadcast(); if (wasPlaying) settle(); }
  });

  const timer = setInterval(() => { if (game.tick()) { broadcast(); settle(); } }, 500);
  timer.unref?.();

  // ---------- 🤖 Bot ----------
  const bot = {
    name: '🤖 Bot Kỳ Thủ',
    appearance: { skin: '#f1c27d', hair: '#d9d9e3', hairStyle: 3, shirt: '#3a2a1a', pants: '#2d3446' },
    tick(botId, { schedule, humans, rnd, say }) {
      const s = game.s;
      const seat = game.seatOf(botId);
      const humanSeat = ['w', 'b'].find((k) => s.seats[k] && s.seats[k] !== botId);
      const waiting = humans('chess').filter((h) => !game.seatOf(h.id));

      if (!seat) {
        // Ngồi vào khi có 1 người đang chờ đối thủ và không còn ai khác muốn chơi
        if (humanSeat && s.status !== 'playing' && waiting.length === 0) {
          schedule('chess-sit', 1200, () => {
            const free = ['w', 'b'].find((k) => !game.s.seats[k]);
            if (free && game.s.status !== 'playing') act(botId, 'sit', free);
          });
        }
        return;
      }
      if (s.status !== 'playing') {
        if (!humanSeat || waiting.length > 0) { schedule('chess-stand', 800, () => act(botId, 'stand')); return; }
        // Ván xong mà người chơi vẫn ngồi → bot mời ván mới
        if (s.status === 'over') {
          const tag = s.history.length;
          schedule(`chess-rematch-${tag}`, 7000, () => {
            if (game.s.status === 'over' && game.seatOf(botId) && game.s.seats.w && game.s.seats.b) act(botId, 'rematch');
          });
        }
        return;
      }
      const ply = s.history.length;
      // Đối thủ xin hòa: đồng ý nếu bot đang yếu thế hoặc thế cờ cân bằng sau nhiều nước
      if (s.drawOffer && s.drawOffer !== seat) {
        schedule(`chess-draw-${ply}`, rnd(1500, 3000), () => {
          if (game.s.status !== 'playing' || !game.s.drawOffer || game.s.drawOffer === seat) return;
          let score = evaluate(game.s.pos);
          if (game.s.pos.turn !== seat) score = -score;
          if (score < -150 || (Math.abs(score) <= 60 && game.s.history.length >= 40)) { say(botId, 'Ok, hòa nhé 🤝'); act(botId, 'acceptDraw'); }
          else { say(botId, 'Chưa đâu, đánh tiếp nào 😎'); act(botId, 'declineDraw'); }
        });
      }
      if (s.pos.turn !== seat) return;
      schedule(`chess-move-${ply}`, rnd(500, 1300), () => {
        if (game.s.status !== 'playing' || game.s.pos.turn !== seat || game.s.history.length !== ply) return;
        const left = game.clockLeft(seat);
        const res = bestMove(game.s.pos, { timeMs: left < 20_000 ? 80 : 280 });
        if (!res) return;
        // Thua quá đậm thì xin thua cho lịch sự
        if (res.score < -1200 && ply > 20) { say(botId, 'Bạn giỏi quá, mình xin thua 🏳️'); act(botId, 'surrender'); return; }
        act(botId, 'move', { from: res.from, to: res.to, promo: res.promo });
      });
    },
  };

  return { game, act, bot };
}
