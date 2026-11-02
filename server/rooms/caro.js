// ⭕ Cờ Caro 15x15 – 5 ô liên tiếp thắng. Người thứ 3+ là khán giả.
export const SIZE = 15;
export const TURN_MS = 30_000;

/** Trả về mảng 5+ ô thắng nếu nước (x,y) tạo thành chuỗi ≥5, ngược lại null. */
export function checkWin(board, x, y, size = SIZE) {
  const me = board[y * size + x];
  if (!me) return null;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const line = [y * size + x];
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (cx >= 0 && cy >= 0 && cx < size && cy < size && board[cy * size + cx] === me) {
        line.push(cy * size + cx);
        cx += dx * s; cy += dy * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function createCaro(now = Date.now) {
  const s = {
    board: new Array(SIZE * SIZE).fill(''),
    seats: { X: null, O: null },      // socket id
    status: 'waiting',                // waiting | playing | over
    turn: 'X',
    winner: null,                     // 'X' | 'O' | 'draw'
    reason: '',
    winLine: [],
    lastMove: -1,
    deadline: 0,
    wins: {},                         // id -> số ván thắng
  };

  const seatOf = (id) => (s.seats.X === id ? 'X' : s.seats.O === id ? 'O' : null);
  const other = (seat) => (seat === 'X' ? 'O' : 'X');

  const reset = () => {
    s.board.fill('');
    s.turn = 'X'; s.winner = null; s.reason = ''; s.winLine = []; s.lastMove = -1;
    if (s.seats.X && s.seats.O) { s.status = 'playing'; s.deadline = now() + TURN_MS; }
    else { s.status = 'waiting'; s.deadline = 0; }
  };
  const finish = (winner, reason) => {
    s.status = 'over'; s.winner = winner; s.reason = reason; s.deadline = 0;
    if (winner === 'X' || winner === 'O') {
      const id = s.seats[winner];
      if (id) s.wins[id] = (s.wins[id] || 0) + 1;
    }
  };

  return {
    s, seatOf,
    sit(id, seat) {
      if (!['X', 'O'].includes(seat) || s.seats[seat] || seatOf(id) || s.status === 'playing') return false;
      s.seats[seat] = id;
      if (s.seats.X && s.seats.O) reset();
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
    move(id, i) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || seat !== s.turn || !Number.isInteger(i) || i < 0 || i >= s.board.length || s.board[i]) return false;
      s.board[i] = seat;
      s.lastMove = i;
      const line = checkWin(s.board, i % SIZE, Math.floor(i / SIZE));
      if (line) { s.winLine = line; finish(seat, '5 ô liên tiếp'); }
      else if (s.board.every(Boolean)) finish('draw', 'hết bàn cờ');
      else { s.turn = other(seat); s.deadline = now() + TURN_MS; }
      return true;
    },
    surrender(id) {
      const seat = seatOf(id);
      if (s.status !== 'playing' || !seat) return false;
      finish(other(seat), 'đầu hàng');
      return true;
    },
    rematch(id) {
      if (s.status !== 'over' || !seatOf(id)) return false;
      reset();
      return true;
    },
    swap(id) {
      if (s.status === 'playing' || !seatOf(id)) return false;
      [s.seats.X, s.seats.O] = [s.seats.O, s.seats.X];
      return true;
    },
    /** Gọi định kỳ: hết giờ → thua. Trả true nếu trạng thái đổi. */
    tick() {
      if (s.status === 'playing' && now() > s.deadline) { finish(other(s.turn), 'hết giờ'); return true; }
      return false;
    },
  };
}

export function registerCaro(io, world) {
  const game = createCaro();
  const ROOM = 'room:caro';
  const name = (id) => (id ? world.get(id)?.name ?? '?' : null);

  const view = () => {
    const s = game.s;
    return {
      size: SIZE, board: s.board, status: s.status, turn: s.turn, winner: s.winner, reason: s.reason,
      winLine: s.winLine, lastMove: s.lastMove, turnMs: TURN_MS,
      remainingMs: s.deadline ? Math.max(0, s.deadline - Date.now()) : 0,
      seats: {
        X: s.seats.X && { id: s.seats.X, name: name(s.seats.X), wins: s.wins[s.seats.X] || 0 },
        O: s.seats.O && { id: s.seats.O, name: name(s.seats.O), wins: s.wins[s.seats.O] || 0 },
      },
    };
  };
  const broadcast = () => io.to(ROOM).emit('caro:state', view());
  const announce = () => {
    const s = game.s;
    if (s.status !== 'over') return;
    const text = s.winner === 'draw' ? '⭕ Caro: hòa!' : `⭕ Caro: ${name(s.seats[s.winner]) ?? s.winner} thắng (${s.reason})! 🏆`;
    io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  };

  const ACTIONS = {
    sit: (id, seat) => game.sit(id, seat),
    stand: (id) => game.leave(id),
    move: (id, i) => game.move(id, i),
    surrender: (id) => game.surrender(id),
    rematch: (id) => game.rematch(id),
    swap: (id) => game.swap(id),
  };
  /** Thực hiện 1 hành động (người thật qua socket, hoặc bot gọi trực tiếp). */
  function act(id, type, arg) {
    if (world.get(id)?.room !== 'caro' || !ACTIONS[type]) return false;
    const before = game.s.status;
    const ok = ACTIONS[type](id, arg);
    if (ok) { broadcast(); if (before === 'playing' && game.s.status === 'over') announce(); }
    return ok;
  }

  io.on('connection', (socket) => {
    socket.on('caro:sync', () => world.get(socket.id)?.room === 'caro' && socket.emit('caro:state', view()));
    for (const type of Object.keys(ACTIONS)) socket.on(`caro:${type}`, (arg) => act(socket.id, type, arg));
  });

  world.events.on('room', ({ p, prev }) => {
    if (prev !== 'caro') return;
    const wasPlaying = game.s.status === 'playing';
    if (game.leave(p.id)) { broadcast(); if (wasPlaying) announce(); }
  });

  setInterval(() => { if (game.tick()) { broadcast(); announce(); } }, 500);
  return { game, act };
}
