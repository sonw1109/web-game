// ✊ Oẳn Tù Tì – cả phòng cùng ra tay mỗi vòng; thắng ai được 1 điểm người đó.
// Trong pha chọn server CHỈ gửi "đã chọn", lựa chọn thật chỉ lộ khi hết giờ.
import { rateLimiter } from '../world.js';

export const COUNT_MS = 3_000;    // 3-2-1
export const PICK_MS = 8_000;     // 8 giây chọn
export const RESULT_MS = 4_000;   // xem kết quả rồi sang vòng mới
export const CHOICES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

/** a thắng b? */
export const beats = (a, b) => BEATS[a] === b;

/**
 * Tính kết quả 1 vòng. picks: [[id, choice]…]
 * → { gains: {id: số người mình thắng}, losses: {id: số người thua}, wins: [[thắng, thua]…] }
 */
export function scoreRound(picks) {
  const gains = Object.create(null), losses = Object.create(null), wins = [];
  for (const [id] of picks) { gains[id] = 0; losses[id] = 0; }
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const [a, ca] = picks[i], [b, cb] = picks[j];
      if (beats(ca, cb)) { gains[a]++; losses[b]++; wins.push([a, b]); }
      else if (beats(cb, ca)) { gains[b]++; losses[a]++; wins.push([b, a]); }
    }
  }
  return { gains, losses, wins };
}

export function createRps({ now = Date.now } = {}) {
  const s = {
    phase: 'idle',                    // idle | count | pick | result
    round: 0,
    deadline: 0,
    picks: new Map(),                 // id → lựa chọn (BÍ MẬT tới khi lộ)
    watchers: new Set(),              // chỉ xem
    scores: Object.create(null),      // điểm cả phiên
    streak: Object.create(null),      // chuỗi thắng hiện tại
    best: Object.create(null),        // chuỗi dài nhất
    last: null,                       // kết quả vòng vừa xong { picks, gains, wins }
    lastPick: Object.create(null),    // lựa chọn vòng trước (bot dùng)
  };

  return {
    s,
    /** Người trong phòng (mảng id) – lọc khán giả ra. */
    players(ids) { return ids.filter((id) => !s.watchers.has(id)); },
    pick(id, choice) {
      if (s.phase !== 'pick' || s.watchers.has(id) || !CHOICES.includes(choice)) return false;
      s.picks.set(id, choice);
      return true;
    },
    watch(id, on) {
      if (typeof on !== 'boolean') return false;
      if (on) { s.watchers.add(id); s.picks.delete(id); } else s.watchers.delete(id);
      return true;
    },
    leave(id) {
      s.picks.delete(id); s.watchers.delete(id);
      delete s.scores[id]; delete s.streak[id]; delete s.best[id]; delete s.lastPick[id];
    },
    /**
     * Gọi định kỳ với danh sách id đang trong phòng.
     * Trả về 'count' | 'pick' | 'result' | 'idle' khi chuyển pha, null nếu không đổi.
     */
    tick(ids) {
      const t = now();
      const players = this.players(ids);
      if (s.phase === 'idle') {
        if (players.length < 2) return null;
        s.phase = 'count'; s.round++; s.deadline = t + COUNT_MS; s.picks = new Map();
        return 'count';
      }
      if (t < s.deadline) return null;
      if (s.phase === 'count') {
        if (players.length < 2) { s.phase = 'idle'; s.deadline = 0; return 'idle'; }
        s.phase = 'pick'; s.deadline = t + PICK_MS;
        return 'pick';
      }
      if (s.phase === 'pick') {
        const present = new Set(players);
        const picks = [...s.picks].filter(([id]) => present.has(id));
        const r = scoreRound(picks);
        for (const [id, c] of picks) {
          s.scores[id] = (s.scores[id] || 0) + r.gains[id];
          s.lastPick[id] = c;
          const won = r.gains[id] > r.losses[id];
          s.streak[id] = won ? (s.streak[id] || 0) + 1 : 0;
          s.best[id] = Math.max(s.best[id] || 0, s.streak[id]);
        }
        // ai không chọn thì đứt chuỗi
        for (const id of players) if (!s.picks.has(id)) s.streak[id] = 0;
        s.last = { round: s.round, picks: Object.fromEntries(picks), gains: { ...r.gains }, losses: { ...r.losses }, wins: r.wins };
        s.phase = 'result'; s.deadline = t + RESULT_MS; s.picks = new Map();
        return 'result';
      }
      if (s.phase === 'result') {
        if (players.length < 2) { s.phase = 'idle'; s.deadline = 0; return 'idle'; }
        s.phase = 'count'; s.round++; s.deadline = t + COUNT_MS;
        return 'count';
      }
      return null;
    },
  };
}

/** View chung – trong pha chọn chỉ có cờ "đã chọn". */
export function rpsView(game, members, now = Date.now()) {
  const s = game.s;
  return {
    phase: s.phase, round: s.round,
    remainingMs: s.deadline ? Math.max(0, s.deadline - now) : 0,
    countMs: COUNT_MS, pickMs: PICK_MS, resultMs: RESULT_MS,
    players: members.map((p) => ({
      id: p.id, name: p.name,
      watching: s.watchers.has(p.id),
      picked: s.phase === 'pick' && s.picks.has(p.id),
      score: s.scores[p.id] || 0, streak: s.streak[p.id] || 0, best: s.best[p.id] || 0,
    })),
    last: s.phase === 'result' ? s.last : null,
  };
}

export function register(io, world, arcade, { now = Date.now } = {}) {
  const ROOM = 'room:rps';
  const game = createRps({ now });
  const members = () => world.inRoom('rps');
  const view = () => rpsView(game, members().map((p) => ({ id: p.id, name: p.name })), now());
  const broadcast = () => io.to(ROOM).emit('rps:state', view());
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  const limit = rateLimiter(10, 3000);

  function act(id, type, arg) {
    if (world.get(id)?.room !== 'rps') return false;
    const s = game.s;
    if (type === 'pick') {
      const had = s.picks.has(id);
      const ok = game.pick(id, arg);
      if (ok && !had) broadcast();          // chỉ báo "đã chọn" lần đầu, đổi lựa chọn không cần phát lại
      return ok;
    }
    if (type === 'watch') {
      const ok = game.watch(id, arg);
      if (ok) broadcast();
      return ok;
    }
    return false;
  }

  io.on('connection', (socket) => {
    socket.on('rps:sync', () => world.get(socket.id)?.room === 'rps' && socket.emit('rps:state', view()));
    for (const type of ['pick', 'watch']) {
      socket.on(`rps:${type}`, (arg) => {
        if (world.get(socket.id)?.room !== 'rps' || !limit(socket.id)) return;
        act(socket.id, type, arg);
      });
    }
  });

  world.events.on('room', ({ p, prev, room }) => {
    if (prev === 'rps') { game.leave(p.id); broadcast(); }
    else if (room === 'rps') broadcast();
  });

  const settle = () => {
    const last = game.s.last;
    if (!last) return;
    for (const [id, pts] of Object.entries(last.gains)) {
      arcade?.award('rps', id, pts, { win: pts > (last.losses[id] || 0), best: game.s.best[id] || 0 });
    }
    const ids = Object.keys(last.picks);
    if (ids.length < 2) return;
    const top = Math.max(...ids.map((id) => last.gains[id]));
    if (top === 0) return sys(`✊ Vòng ${last.round}: hòa cả làng!`);
    const champs = ids.filter((id) => last.gains[id] === top).map((id) => world.get(id)?.name ?? '?');
    sys(`✊ Vòng ${last.round}: ${champs.join(', ')} thắng ${top} người!`);
  };

  const timer = setInterval(() => {
    const ev = game.tick(members().map((p) => p.id));
    if (!ev) return;
    if (ev === 'result') settle();
    broadcast();
  }, 200);
  timer.unref?.();

  let botRound = 0;
  return {
    game, act,
    bot: {
      name: '🤖 Tay Sắt',
      appearance: { skin: '#f1c27d', hair: '#1b1b1f', hairStyle: 3, shirt: '#d35400', pants: '#34495e' },
      tick(botId, { schedule, rnd, pick }) {
        const s = game.s;
        if (s.phase !== 'pick' || botRound === s.round) return;
        const round = botRound = s.round;
        schedule(`rps:pick:${round}`, rnd(800, 6000), () => {
          if (game.s.round !== round) return;
          const prev = game.s.lastPick[botId];
          // thiên vị lặp lại lựa chọn cũ
          act(botId, 'pick', prev && rnd(0, 1) < 0.45 ? prev : pick(CHOICES));
        });
      },
    },
  };
}
