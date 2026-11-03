// 🧠 Đố Mẹo – cả phòng cùng trả lời câu đố mẹo dân gian, ai đúng sớm được nhiều điểm hơn.
// Phần logic thuần (createRiddle) tách khỏi socket để test; đáp án CHỈ được gửi xuống khi đã lộ.
import { readFileSync } from 'node:fs';
import { rateLimiter, reply } from '../world.js';

export const ROUNDS = 10;             // số câu 1 ván
export const ASK_MS = 40_000;         // thời gian trả lời
export const HINT1_MS = 15_000;       // sau 15 giây: lộ gợi ý
export const HINT2_MS = 28_000;       // sau 28 giây: lộ chữ cái đầu + số chữ
export const REVEAL_MS = 5_000;       // lộ đáp án 5 giây rồi sang câu tiếp
export const OVER_MS = 12_000;        // bảng điểm cuối ván, sau đó tự chơi tiếp nếu còn người
export const MAX_GUESSES = 8;         // tối đa 8 lần đoán / câu
export const MAX_LEN = 60;            // ô trả lời tối đa 60 ký tự
export const PTS_MAX = 100, PTS_MIN = 40;

const LEAD_WORDS = new Set(['la', 'con', 'cai', 'qua', 'trai', 'chiec', 'cay']);

/** Chuẩn hóa câu trả lời: bỏ dấu, chữ thường, bỏ dấu câu/khoảng trắng thừa, bỏ "là/con/cái/quả…" ở đầu. */
export function normalizeAnswer(text) {
  if (typeof text !== 'string') return '';
  const words = text.slice(0, 200).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  // bỏ chữ loại từ ở đầu nhưng luôn giữ lại ít nhất 1 chữ ("con" → "con")
  while (words.length > 1 && LEAD_WORDS.has(words[0])) words.shift();
  return words.join(' ');
}

/** So khớp câu trả lời với danh sách đáp án chấp nhận. */
export function isCorrect(text, answers) {
  const t = normalizeAnswer(text);
  return !!t && Array.isArray(answers) && answers.some((a) => normalizeAnswer(a) === t);
}

/** Gợi ý cấp 2: chữ cái đầu + gạch dưới cho các chữ còn lại, kèm số chữ (từ). */
export function maskAnswer(answer) {
  const words = String(answer).trim().split(/\s+/).filter(Boolean);
  let first = true;
  const masked = words.map((w) => [...w].map((ch) => {
    if (first) { first = false; return ch.toUpperCase(); }
    return '_';
  }).join(' ')).join('   ');
  return `${masked}  (${words.length} chữ)`;
}

/** Điểm theo thời gian: đúng ngay = 100, sát giờ = 40. */
export const pointsFor = (elapsed) =>
  Math.round(PTS_MAX - (PTS_MAX - PTS_MIN) * Math.min(1, Math.max(0, elapsed / ASK_MS)));

export function loadRiddles() {
  const raw = JSON.parse(readFileSync(new URL('../data/riddles-vi.json', import.meta.url), 'utf8'));
  return raw.filter((r) => r && typeof r.q === 'string' && Array.isArray(r.a) && r.a.length);
}

export function createRiddle({ riddles, now = Date.now, rand = Math.random } = {}) {
  const s = {
    phase: 'idle',                    // idle | ask | reveal | over
    round: 0,                         // 1..ROUNDS
    qid: 0,                           // số thứ tự câu hỏi (tăng mãi) – bot dùng để biết câu mới
    current: null,                    // { q, a, hint }
    startedAt: 0,
    deadline: 0,
    scores: Object.create(null),      // id → điểm ván này
    solved: new Map(),                // id → điểm của câu hiện tại (thứ tự = thứ tự trả lời đúng)
    guesses: new Map(),               // id → số lần đoán câu hiện tại
    winners: [],                      // id thắng ván vừa xong
    recent: [],                       // chỉ số câu vừa hỏi (tránh lặp)
    lastHint: 0,
  };
  let deck = [];

  const draw = () => {
    if (!deck.length) {
      deck = riddles.map((_, i) => i).filter((i) => !s.recent.includes(i));
      if (!deck.length) deck = riddles.map((_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    }
    const k = deck.pop();
    s.recent.push(k);
    if (s.recent.length > Math.min(40, Math.floor(riddles.length / 2))) s.recent.shift();
    return riddles[k];
  };

  const ask = () => {
    s.round++; s.qid++;
    s.current = draw();
    s.solved = new Map(); s.guesses = new Map();
    s.phase = 'ask'; s.lastHint = 0; s.startedAt = now(); s.deadline = s.startedAt + ASK_MS;
  };
  const reveal = () => { s.phase = 'reveal'; s.deadline = now() + REVEAL_MS; };
  const finish = () => {
    s.phase = 'over'; s.deadline = now() + OVER_MS;
    const best = Math.max(0, ...Object.values(s.scores));
    s.winners = best > 0 ? Object.keys(s.scores).filter((id) => s.scores[id] === best) : [];
  };

  return {
    s,
    /** Bắt đầu ván mới (khi đang rảnh hoặc đã xong ván). */
    start() {
      if (s.phase === 'ask' || s.phase === 'reveal') return false;
      s.round = 0; s.scores = Object.create(null); s.winners = [];
      ask();
      return true;
    },
    /** Trả lời: { ok, correct, pts, left, reason }. */
    answer(id, text) {
      if (s.phase !== 'ask' || typeof text !== 'string') return { ok: false, reason: 'not-asking' };
      text = text.slice(0, MAX_LEN);
      if (!normalizeAnswer(text)) return { ok: false, reason: 'empty' };
      if (s.solved.has(id)) return { ok: false, reason: 'solved' };
      const n = s.guesses.get(id) || 0;
      if (n >= MAX_GUESSES) return { ok: false, reason: 'limit', left: 0 };
      s.guesses.set(id, n + 1);
      if (!isCorrect(text, s.current.a)) return { ok: true, correct: false, left: MAX_GUESSES - n - 1 };
      const pts = pointsFor(now() - s.startedAt);
      s.solved.set(id, pts);
      s.scores[id] = (s.scores[id] || 0) + pts;
      return { ok: true, correct: true, pts };
    },
    /** Mọi người đang chơi đã đúng → lộ đáp án luôn. */
    revealIfAll(ids) {
      if (s.phase !== 'ask' || !ids.length || !ids.every((id) => s.solved.has(id))) return false;
      reveal();
      return true;
    },
    leave(id) {
      delete s.scores[id]; s.solved.delete(id); s.guesses.delete(id);
      s.winners = s.winners.filter((w) => w !== id);
    },
    reset() { s.phase = 'idle'; s.round = 0; s.current = null; s.deadline = 0; s.scores = Object.create(null); s.solved = new Map(); s.guesses = new Map(); s.winners = []; },
    hintLevel() {
      if (s.phase !== 'ask') return s.phase === 'reveal' ? 2 : 0;
      const e = now() - s.startedAt;
      return e >= HINT2_MS ? 2 : e >= HINT1_MS ? 1 : 0;
    },
    /**
     * Gọi định kỳ. hasPlayers: còn người trong phòng không.
     * Trả về tên sự kiện vừa xảy ra: 'reveal' | 'next' | 'over' | 'restart' | 'hint' | null
     */
    tick(hasPlayers = true) {
      const t = now();
      if (s.phase === 'ask') {
        if (t >= s.deadline) { reveal(); return 'reveal'; }
        const lvl = this.hintLevel();
        if (lvl !== s.lastHint) { s.lastHint = lvl; if (lvl) return 'hint'; }
        return null;
      }
      if (s.phase === 'reveal' && t >= s.deadline) {
        s.lastHint = 0;
        if (s.round >= ROUNDS) { finish(); return 'over'; }
        ask(); return 'next';
      }
      if (s.phase === 'over' && t >= s.deadline && hasPlayers) { this.start(); return 'restart'; }
      return null;
    },
  };
}

/** Dữ liệu gửi xuống client – không bao giờ chứa đáp án khi chưa lộ. */
export function riddleView(game, name = () => null, now = Date.now()) {
  const s = game.s;
  const lvl = game.hintLevel();
  const c = s.current;
  return {
    phase: s.phase, round: s.round, rounds: ROUNDS, qid: s.qid,
    q: c && s.phase !== 'idle' ? c.q : null,
    hint: c && lvl >= 1 ? c.hint || null : null,
    mask: c && s.phase === 'ask' && lvl >= 2 ? maskAnswer(c.a[0]) : null,
    answer: c && (s.phase === 'reveal' || s.phase === 'over') ? c.a[0] : null,
    askMs: ASK_MS, revealMs: REVEAL_MS, overMs: OVER_MS,
    remainingMs: s.deadline ? Math.max(0, s.deadline - now) : 0,
    solved: [...s.solved].map(([id, pts]) => ({ id, name: name(id), pts })),
    scores: Object.entries(s.scores).map(([id, pts]) => ({ id, name: name(id), pts })).sort((a, b) => b.pts - a.pts),
    winners: s.winners.map((id) => ({ id, name: name(id) })),
    maxGuesses: MAX_GUESSES,
  };
}

const WRONG = ['con gà', 'cái bàn', 'con mèo', 'nước', 'cái nón', 'ông trời', 'con heo', 'cái ghế', 'mặt trời', 'không biết'];

export function register(io, world, arcade, { riddles = loadRiddles(), now = Date.now } = {}) {
  const ROOM = 'room:riddle';
  const game = createRiddle({ riddles, now });
  const name = (id) => world.get(id)?.name ?? '?';
  const members = () => world.inRoom('riddle');
  const broadcast = () => io.to(ROOM).emit('riddle:state', riddleView(game, name, now()));
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  const answerLimit = rateLimiter(6, 4000);
  const startLimit = rateLimiter(3, 5000);

  const onOver = () => {
    const s = game.s;
    for (const id of s.winners) arcade?.award('riddle', id, 0, { win: true, best: s.scores[id] });
    if (s.winners.length) sys(`🧠 Đố Mẹo: ${s.winners.map(name).join(', ')} thắng ván với ${s.scores[s.winners[0]]} điểm! 🏆`);
    else sys('🧠 Đố Mẹo: hết ván – không ai ghi điểm 😅');
  };

  /** Hành động (người thật qua socket hoặc bot gọi thẳng). Trả về kết quả cho ack. */
  function act(id, type, arg) {
    if (world.get(id)?.room !== 'riddle') return { ok: false };
    if (type === 'start') {
      const ok = game.start();
      if (ok) { broadcast(); sys(`🧠 ${name(id)} bắt đầu ván Đố Mẹo mới – ${ROUNDS} câu!`); }
      return { ok };
    }
    if (type === 'answer') {
      if (typeof arg !== 'string' || arg.length > 500) return { ok: false, reason: 'bad' };
      const r = game.answer(id, arg);
      if (r.correct) {
        arcade?.award('riddle', id, r.pts);
        sys(`🧠 ${name(id)} đã trả lời đúng! (+${r.pts})`);
        if (game.revealIfAll(members().map((p) => p.id))) sys(`🧠 Cả phòng đều đúng! Đáp án: ${game.s.current.a[0]}`);
        broadcast();
      }
      return r;
    }
    return { ok: false };
  }

  io.on('connection', (socket) => {
    socket.on('riddle:sync', () => {
      if (world.get(socket.id)?.room === 'riddle') socket.emit('riddle:state', riddleView(game, name, now()));
    });
    socket.on('riddle:start', (...args) => {
      const ack = args.find((a) => typeof a === 'function');
      if (world.get(socket.id)?.room !== 'riddle' || !startLimit(socket.id)) return reply(ack, { ok: false });
      reply(ack, act(socket.id, 'start'));
    });
    socket.on('riddle:answer', (text, ack) => {
      if (world.get(socket.id)?.room !== 'riddle') return reply(ack, { ok: false });
      if (!answerLimit(socket.id)) return reply(ack, { ok: false, reason: 'slow' });
      reply(ack, act(socket.id, 'answer', text));
    });
  });

  world.events.on('room', ({ p, prev }) => {
    if (prev !== 'riddle') return;
    game.leave(p.id);
    if (!members().length) game.reset();
    else game.revealIfAll(members().map((m) => m.id));
    broadcast();
  });

  const timer = setInterval(() => {
    const ev = game.tick(members().some((p) => !p.bot));
    if (!ev) return;
    if (ev === 'over') onOver();
    if (ev === 'reveal') sys(`🧠 Đáp án: ${game.s.current.a[0]}`);
    broadcast();
  }, 250);
  timer.unref?.();

  let botQid = 0;   // câu bot đã lên kế hoạch trả lời
  return {
    game, act,
    bot: {
      name: '🤖 Thầy Đồ',
      appearance: { skin: '#f1c27d', hair: '#e8e8e8', hairStyle: 2, shirt: '#8e44ad', pants: '#2c2c3a' },
      tick(botId, { schedule, humans, rnd, pick }) {
        const s = game.s;
        if ((s.phase === 'idle' || (s.phase === 'over' && s.deadline - now() > 4000)) && humans('riddle').length) {
          if (s.phase === 'idle') schedule('riddle:start', 4000, () => { if (game.s.phase === 'idle') act(botId, 'start'); });
          return;
        }
        if (s.phase !== 'ask' || s.solved.has(botId) || botQid === s.qid) return;
        const qid = botQid = s.qid;
        // thỉnh thoảng đoán sai trước
        if (rnd(0, 1) < 0.35) schedule(`riddle:wrong:${qid}`, rnd(5000, 20000), () => { if (game.s.qid === qid) act(botId, 'answer', pick(WRONG)); });
        schedule(`riddle:ans:${qid}`, rnd(8000, 30000), () => {
          if (game.s.qid !== qid || game.s.phase !== 'ask') return;
          act(botId, 'answer', rnd(0, 1) < 0.5 ? pick(game.s.current.a) : pick(WRONG));
        });
      },
    },
  };
}
