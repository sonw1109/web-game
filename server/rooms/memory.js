// 🃏 Lật Hình – 2–6 người ngồi bàn, lần lượt lật 2 thẻ; trùng hình được điểm và lật tiếp.
// Server giữ mặt thẻ: chỉ gửi emoji của thẻ đang lật hoặc đã ăn.
import { rateLimiter } from '../world.js';

export const MAX_SEATS = 6;
export const TURN_MS = 20_000;
export const HIDE_MS = 1_200;
export const SIZES = { 8: { cols: 4, rows: 4 }, 12: { cols: 6, rows: 4 } };
export const PAIR_PTS = 10, WIN_BONUS = 30;
export const EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐸', '🐵', '🦁', '🐯', '🐷', '🐰', '🐨', '🐙', '🦄', '🐝', '🐢', '🐬', '🍉', '🍓', '🍌', '🍍', '🌽', '🍕', '⚽', '🎈'];

export function createMemory({ now = Date.now, rand = Math.random } = {}) {
  const s = {
    seats: [],                        // id theo thứ tự lượt
    host: null,
    status: 'waiting',                // waiting | playing | over
    pairsTotal: 8,
    deck: [],                         // emoji từng ô (bí mật)
    owner: [],                        // id người ăn ô (null = chưa ăn)
    flipped: [],                      // các ô đang ngửa (chưa giải quyết)
    hideAt: 0,                        // >0: đang chờ úp lại 2 thẻ không trùng
    turn: 0,                          // chỉ số trong seats
    deadline: 0,
    pairs: Object.create(null),       // id → số cặp ván này
    winners: [],
    reason: '',
    serial: 0,                        // tăng mỗi lần lật / đổi lượt (bot dùng làm key)
    last: null,                       // { type: 'match'|'miss'|'timeout', id }
  };

  const turnId = () => (s.status === 'playing' ? s.seats[s.turn] ?? null : null);
  const nextTurn = () => {
    s.flipped = []; s.hideAt = 0;
    if (s.seats.length) s.turn = (s.turn + 1) % s.seats.length;
    s.deadline = now() + TURN_MS; s.serial++;
  };
  const finish = (reason) => {
    s.status = 'over'; s.reason = reason; s.flipped = []; s.hideAt = 0; s.deadline = 0; s.serial++;
    const best = Math.max(0, ...s.seats.map((id) => s.pairs[id] || 0));
    s.winners = best > 0 ? s.seats.filter((id) => (s.pairs[id] || 0) === best) : [];
  };

  return {
    s, turnId,
    join(id) {
      if (s.status === 'playing' || s.seats.includes(id) || s.seats.length >= MAX_SEATS) return false;
      s.seats.push(id);
      return true;
    },
    /** Rời bàn (bấm rời / ra khỏi phòng). Trả về true nếu có thay đổi. */
    leave(id) {
      const i = s.seats.indexOf(id);
      if (i < 0) return false;
      const wasTurn = s.status === 'playing' && i === s.turn;
      s.seats.splice(i, 1);
      delete s.pairs[id];
      if (s.host === id) s.host = s.seats[0] ?? null;
      s.winners = s.winners.filter((w) => w !== id);
      if (s.status !== 'playing') return true;
      if (s.seats.length < 2) { finish('không đủ người chơi'); return true; }
      if (i < s.turn) s.turn--;
      if (wasTurn) {
        // người đang tới lượt rời: úp thẻ của họ lại, chuyển cho người kế tiếp (đã dịch lên vị trí i)
        s.turn = (i - 1 + s.seats.length) % s.seats.length;
        nextTurn();
      }
      return true;
    },
    start(id, pairs) {
      if (s.status === 'playing' || !s.seats.includes(id) || s.seats.length < 2) return false;
      const n = pairs === 12 ? 12 : 8;
      const pool = EMOJIS.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const deck = [...pool.slice(0, n), ...pool.slice(0, n)];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      Object.assign(s, {
        host: id, status: 'playing', pairsTotal: n, deck, owner: deck.map(() => null), flipped: [], hideAt: 0,
        turn: 0, deadline: now() + TURN_MS, pairs: Object.create(null), winners: [], reason: '', last: null,
      });
      s.serial++;
      return true;
    },
    /** Lật ô i. Trả về null nếu không hợp lệ, ngược lại 'one' | 'match' | 'miss' | 'win'. */
    flip(id, i) {
      if (s.status !== 'playing' || turnId() !== id || s.hideAt || s.flipped.length >= 2) return null;
      if (!Number.isInteger(i) || i < 0 || i >= s.deck.length || s.owner[i] || s.flipped.includes(i)) return null;
      s.flipped.push(i); s.serial++;
      if (s.flipped.length === 1) return 'one';
      const [a, b] = s.flipped;
      if (s.deck[a] === s.deck[b]) {
        s.owner[a] = s.owner[b] = id;
        s.pairs[id] = (s.pairs[id] || 0) + 1;
        s.flipped = []; s.deadline = now() + TURN_MS; s.last = { type: 'match', id };
        if (s.owner.every(Boolean)) { finish('hết thẻ'); return 'win'; }
        return 'match';
      }
      s.hideAt = now() + HIDE_MS; s.last = { type: 'miss', id };
      return 'miss';
    },
    /** Gọi định kỳ: úp thẻ sai / hết giờ lượt. Trả về 'hide' | 'timeout' | null. */
    tick() {
      if (s.status !== 'playing') return null;
      const t = now();
      if (s.hideAt) { if (t >= s.hideAt) { nextTurn(); return 'hide'; } return null; }
      if (t > s.deadline) { s.last = { type: 'timeout', id: turnId() }; nextTurn(); return 'timeout'; }
      return null;
    },
  };
}

/** Dữ liệu cho client: mặt thẻ chỉ lộ khi đang ngửa hoặc đã ăn. */
export function memoryView(game, name = () => null, now = Date.now()) {
  const s = game.s;
  const up = new Set(s.flipped);
  const showAll = s.status === 'over';
  return {
    status: s.status, host: s.host, pairsTotal: s.pairsTotal,
    cols: SIZES[s.pairsTotal].cols, rows: SIZES[s.pairsTotal].rows,
    cards: s.deck.map((e, i) => (s.owner[i] ? { e, by: s.owner[i] } : up.has(i) || showAll ? { e, up: true } : {})),
    flipped: s.flipped.slice(),
    hiding: !!s.hideAt,
    turn: game.turnId(),
    turnMs: TURN_MS,
    remainingMs: s.status === 'playing' && s.deadline ? Math.max(0, s.deadline - now) : 0,
    seats: s.seats.map((id) => ({ id, name: name(id), pairs: s.pairs[id] || 0 })),
    winners: s.winners.map((id) => ({ id, name: name(id) })),
    reason: s.reason,
    last: s.last,
    maxSeats: MAX_SEATS,
  };
}

export function register(io, world, arcade, { now = Date.now } = {}) {
  const ROOM = 'room:memory';
  const game = createMemory({ now });
  const name = (id) => world.get(id)?.name ?? '?';
  const broadcast = () => io.to(ROOM).emit('memory:state', memoryView(game, name, now()));
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  const limit = rateLimiter(12, 3000);

  // Trí nhớ của bot: ô → emoji đã thấy (nhớ không hoàn hảo)
  let botMem = new Map();
  let botRemember = Math.random;
  const seen = (i) => { if (botRemember() < 0.7) botMem.set(i, game.s.deck[i]); };

  const settle = () => {
    const s = game.s;
    if (s.status !== 'over') return;
    for (const id of s.winners) arcade?.award('memory', id, WIN_BONUS, { win: true, best: s.pairs[id] || 0 });
    if (s.winners.length) sys(`🃏 Lật Hình: ${s.winners.map(name).join(', ')} thắng với ${s.pairs[s.winners[0]]} cặp! 🏆`);
    else sys(`🃏 Lật Hình: ván kết thúc (${s.reason}).`);
  };

  function act(id, type, arg) {
    if (world.get(id)?.room !== 'memory') return false;
    const s = game.s;
    let ok = false;
    if (type === 'join') ok = game.join(id);
    else if (type === 'leave') { const was = s.status; ok = game.leave(id); if (ok && was === 'playing' && s.status === 'over') settle(); }
    else if (type === 'start') {
      ok = game.start(id, arg === 12 ? 12 : 8);
      if (ok) { botMem = new Map(); sys(`🃏 ${name(id)} bắt đầu ván Lật Hình ${s.pairsTotal} cặp!`); }
    } else if (type === 'flip') {
      const r = game.flip(id, arg);
      ok = !!r;
      if (r) {
        for (const i of s.flipped) seen(i);
        if (r === 'match' || r === 'win') { arcade?.award('memory', id, PAIR_PTS); botMem.set(arg, s.deck[arg]); }
        if (r === 'win') settle();
      }
    }
    if (ok) broadcast();
    return ok;
  }

  io.on('connection', (socket) => {
    socket.on('memory:sync', () => world.get(socket.id)?.room === 'memory' && socket.emit('memory:state', memoryView(game, name, now())));
    for (const type of ['join', 'leave', 'start', 'flip']) {
      socket.on(`memory:${type}`, (arg) => {
        if (world.get(socket.id)?.room !== 'memory' || !limit(socket.id)) return;
        act(socket.id, type, typeof arg === 'number' ? arg : null);
      });
    }
  });

  world.events.on('room', ({ p, prev }) => {
    if (prev !== 'memory') return;
    const was = game.s.status;
    if (game.leave(p.id)) { if (was === 'playing' && game.s.status === 'over') settle(); broadcast(); }
  });

  const timer = setInterval(() => { if (game.tick()) broadcast(); }, 200);
  timer.unref?.();

  /** Bot chọn ô: ưu tiên cặp đã nhớ, rồi ô chưa từng thấy. */
  const botChoice = () => {
    const s = game.s;
    const open = s.deck.map((_, i) => i).filter((i) => !s.owner[i] && !s.flipped.includes(i));
    if (!open.length) return null;
    const known = (i) => botMem.has(i) && !s.owner[i];
    if (s.flipped.length === 1) {
      const e = s.deck[s.flipped[0]];
      const mate = open.find((i) => known(i) && botMem.get(i) === e);
      if (mate !== undefined) return mate;
    } else {
      const byEmoji = new Map();
      for (const i of open) if (known(i)) {
        const e = botMem.get(i);
        if (byEmoji.has(e)) return byEmoji.get(e);
        byEmoji.set(e, i);
      }
    }
    const unseen = open.filter((i) => !known(i));
    const pool = unseen.length ? unseen : open;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  return {
    game, act,
    _setBotMemory(fn) { botRemember = fn; },
    bot: {
      name: '🤖 Bé Nhớ',
      appearance: { skin: '#f1c27d', hair: '#5a3825', hairStyle: 1, shirt: '#c0392b', pants: '#2c3e50' },
      tick(botId, { schedule, rnd }) {
        const s = game.s;
        const seatedHumans = s.seats.filter((id) => !world.get(id)?.bot).length;
        if (s.status !== 'playing' && !s.seats.includes(botId) && seatedHumans >= 1 && s.seats.length < 2) {
          schedule('memory:join', 1500, () => act(botId, 'join'));
          return;
        }
        if (s.seats.includes(botId) && !seatedHumans && s.status !== 'playing') { act(botId, 'leave'); return; }
        if (game.turnId() !== botId || s.hideAt) return;
        const serial = s.serial;
        schedule(`memory:flip:${serial}`, rnd(800, 1600), () => {
          if (game.s.serial !== serial || game.turnId() !== botId || game.s.hideAt) return;
          const i = botChoice();
          if (i !== null) act(botId, 'flip', i);
        });
      },
    },
  };
}
