// 🎨 Vẽ & Đoán: lượt luân phiên, người vẽ chọn 1/3 từ, 80s/lượt, đoán trong chat.
import { readFileSync } from 'node:fs';

const WORDS = JSON.parse(readFileSync(new URL('../data/words-vi.json', import.meta.url), 'utf8'));
export const CHOOSE_MS = 12_000;
export const DRAW_MS = 80_000;
export const ROUND_END_MS = 5_000;
const MAX_POINTS = 200_000;

/** Chuẩn hóa để so đáp án: bỏ dấu, chữ thường, gộp khoảng trắng. */
export const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Điểm người đoán: đoán càng sớm càng nhiều (50–300). */
export const guessPoints = (remainingMs, totalMs = DRAW_MS) => Math.max(50, Math.round(300 * remainingMs / totalMs));

/** Gợi ý: '_' cho chữ chưa lộ, giữ khoảng trắng. */
export const maskWord = (word, revealed) =>
  [...word].map((ch, i) => (ch === ' ' ? ' ' : revealed.has(i) ? ch : '_')).join('');

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function registerDrawGuess(io, world) {
  const ROOM = 'room:draw';
  const g = {
    phase: 'idle',          // idle | choosing | drawing | roundEnd | gameOver
    order: [], turn: -1,
    drawerId: null, word: '', choices: [],
    deadline: 0,
    guessed: new Set(),
    revealed: new Set(),
    scores: new Map(),      // id -> điểm ván này
    strokes: [],            // [{sid, c, s, pts:[x,y,...]}]
    totalPts: 0,
    lastResult: null,
  };
  const members = () => world.inRoom('draw');
  const remaining = () => Math.max(0, g.deadline - Date.now());
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });

  const view = () => ({
    phase: g.phase,
    drawerId: g.drawerId,
    drawerName: world.get(g.drawerId)?.name ?? null,
    hint: g.phase === 'drawing' ? maskWord(g.word, g.revealed) : '',
    word: g.phase === 'roundEnd' || g.phase === 'gameOver' ? g.word : '',
    remainingMs: remaining(),
    totalMs: g.phase === 'choosing' ? CHOOSE_MS : g.phase === 'drawing' ? DRAW_MS : ROUND_END_MS,
    turn: g.turn + 1, turns: g.order.length,
    players: members().map((p) => ({ id: p.id, name: p.name, score: g.scores.get(p.id) || 0, guessed: g.guessed.has(p.id) }))
      .sort((a, b) => b.score - a.score),
    result: g.phase === 'gameOver' ? g.lastResult : null,
  });

  const broadcast = () => {
    io.to(ROOM).emit('draw:state', view());
    if (g.drawerId && (g.phase === 'drawing' || g.phase === 'choosing')) {
      io.to(g.drawerId).emit('draw:secret', { word: g.word, choices: g.phase === 'choosing' ? g.choices : [] });
    }
  };

  const clearCanvas = () => { g.strokes = []; g.totalPts = 0; io.to(ROOM).emit('draw:redraw', []); };

  function nextTurn() {
    const present = new Set(members().map((p) => p.id));
    do g.turn++; while (g.turn < g.order.length && !present.has(g.order[g.turn]));
    if (g.turn >= g.order.length || present.size < 2) return gameOver();
    g.phase = 'choosing';
    g.drawerId = g.order[g.turn];
    g.word = '';
    g.choices = shuffle([...WORDS]).slice(0, 3);
    g.guessed = new Set();
    g.revealed = new Set();
    g.deadline = Date.now() + CHOOSE_MS;
    clearCanvas();
    broadcast();
  }

  function choose(i) {
    if (g.phase !== 'choosing') return;
    g.word = g.choices[i] ?? g.choices[0];
    g.phase = 'drawing';
    g.deadline = Date.now() + DRAW_MS;
    sys(`🎨 ${world.get(g.drawerId)?.name} đang vẽ – đoán đi nào!`);
    broadcast();
  }

  function endRound(reason) {
    if (g.phase !== 'drawing' && g.phase !== 'choosing') return;
    g.phase = 'roundEnd';
    g.deadline = Date.now() + ROUND_END_MS;
    if (g.word) sys(`🎨 Từ khóa là "${g.word}"${reason ? ` (${reason})` : ''}`);
    broadcast();
  }

  function gameOver() {
    const ranking = [...g.scores.entries()]
      .map(([id, score]) => ({ id, name: world.get(id)?.name ?? '(đã rời)', score }))
      .sort((a, b) => b.score - a.score);
    g.lastResult = ranking;
    g.phase = 'gameOver';
    g.drawerId = null;
    g.deadline = 0;
    if (ranking[0]) sys(`🏆 Vẽ & Đoán: ${ranking[0].name} thắng với ${ranking[0].score} điểm!`);
    broadcast();
  }

  // Đoán từ qua chat chung
  world.chatFilters.push((p, text) => {
    if (p.room !== 'draw' || g.phase !== 'drawing') return false;
    const correct = normalize(text) === normalize(g.word);
    const isDrawer = p.id === g.drawerId;
    if (isDrawer || g.guessed.has(p.id)) {
      // Người vẽ / người đã đoán đúng không được lộ đáp án
      if (correct || normalize(text).includes(normalize(g.word))) {
        io.to(p.id).emit('chat:message', { system: true, text: '🤐 Không được lộ đáp án nha!', ts: Date.now() });
        return true;
      }
      return false;
    }
    if (!correct) return false;
    const pts = guessPoints(remaining());
    g.scores.set(p.id, (g.scores.get(p.id) || 0) + pts);
    g.scores.set(g.drawerId, (g.scores.get(g.drawerId) || 0) + 50);
    g.guessed.add(p.id);
    sys(`✅ ${p.name} đã đoán đúng! (+${pts})`);
    io.to(ROOM).emit('draw:correct', { id: p.id });
    const guessers = members().filter((m) => m.id !== g.drawerId);
    if (guessers.every((m) => g.guessed.has(m.id))) endRound('mọi người đều đoán đúng');
    else broadcast();
    return true;
  });

  io.on('connection', (socket) => {
    const inRoom = () => world.get(socket.id)?.room === 'draw';
    const isDrawer = () => socket.id === g.drawerId && g.phase === 'drawing';

    socket.on('draw:sync', () => {
      if (!inRoom()) return;
      socket.emit('draw:state', view());
      socket.emit('draw:redraw', g.strokes);
      if (socket.id === g.drawerId) broadcast();
    });
    socket.on('draw:start', () => start(socket.id));
    socket.on('draw:restart', () => restart(socket.id));
    socket.on('draw:choose', (i) => { if (socket.id === g.drawerId) choose(Number(i) | 0); });
    socket.on('draw:stroke', (d) => stroke(socket.id, d, socket));
    socket.on('draw:undo', () => {
      if (!isDrawer()) return;
      const st = g.strokes.pop();
      if (st) g.totalPts -= st.pts.length;
      io.to(ROOM).emit('draw:redraw', g.strokes);
    });
    socket.on('draw:clear', () => { if (isDrawer()) clearCanvas(); });
  });

  function start(id) {
    if (world.get(id)?.room !== 'draw' || !['idle', 'gameOver'].includes(g.phase)) return;
    const ms = members();
    if (ms.length < 2) return io.to(id).emit('chat:message', { system: true, text: 'Cần ít nhất 2 người để chơi Vẽ & Đoán', ts: Date.now() });
    g.order = shuffle(ms.map((m) => m.id));
    g.turn = -1;
    g.scores = new Map(ms.map((m) => [m.id, 0]));
    sys(`🎨 ${world.get(id)?.name} bắt đầu ván Vẽ & Đoán (${ms.length} người)`);
    nextTurn();
  }

  /** Hủy ván đang chơi và bắt đầu ván mới ngay. */
  function restart(id) {
    if (world.get(id)?.room !== 'draw') return;
    if (g.phase !== 'idle' && g.phase !== 'gameOver') sys(`🔄 ${world.get(id)?.name} đã bắt đầu lại ván mới`);
    g.phase = 'idle';
    g.drawerId = null;
    start(id);
    if (g.phase === 'idle') { clearCanvas(); broadcast(); } // không đủ người → về màn hình chờ
  }

  /** Nhận 1 đoạn nét vẽ của người vẽ. socket = null khi bot vẽ. */
  function stroke(id, d, socket) {
      if (id !== g.drawerId || g.phase !== 'drawing' || !d || !Array.isArray(d.pts) || d.pts.length > 400) return;
      const pts = d.pts.map((v) => Math.max(0, Math.min(1000, Math.round(+v || 0))));
      if (g.totalPts + pts.length > MAX_POINTS) return;
      g.totalPts += pts.length;
      const sid = String(d.sid).slice(0, 20);
      let st = g.strokes[g.strokes.length - 1];
      if (!st || st.sid !== sid) {
        st = {
          sid, pts: [],
          c: /^#[0-9a-f]{6}$/i.test(d.c) ? d.c : '#000000',
          s: Math.max(1, Math.min(40, +d.s || 4)),
        };
        g.strokes.push(st);
      }
      st.pts.push(...pts);
      (socket ? socket.to(ROOM) : io.to(ROOM)).emit('draw:stroke', { sid, c: st.c, s: st.s, pts });
  }

  world.events.on('room', ({ p, room, prev }) => {
    if (room === 'draw' && g.phase !== 'idle' && g.phase !== 'gameOver' && !g.scores.has(p.id)) {
      // Người vào giữa chừng: được đoán, và được thêm vào cuối lượt vẽ
      g.scores.set(p.id, 0);
      g.order.push(p.id);
    }
    if (prev !== 'draw') { if (room === 'draw') broadcast(); return; }
    if (g.phase === 'idle' || g.phase === 'gameOver') return broadcast();
    if (members().length < 2) { endRound(); return gameOver(); }
    if (p.id === g.drawerId) return endRound('người vẽ đã rời phòng');
    const guessers = members().filter((m) => m.id !== g.drawerId);
    if (g.phase === 'drawing' && guessers.every((m) => g.guessed.has(m.id))) return endRound();
    broadcast();
  });

  setInterval(() => {
    if (g.phase === 'choosing' && Date.now() > g.deadline) choose(Math.floor(Math.random() * 3));
    else if (g.phase === 'drawing') {
      const left = remaining();
      // Gợi ý chữ cái hiện dần ở 50% và 75% thời gian
      const letters = [...g.word].map((ch, i) => (ch === ' ' ? -1 : i)).filter((i) => i >= 0);
      const want = left < DRAW_MS * 0.25 ? 2 : left < DRAW_MS * 0.5 ? 1 : 0;
      const target = Math.min(want, Math.max(0, letters.length - 2));
      if (g.revealed.size < target) {
        const hidden = letters.filter((i) => !g.revealed.has(i));
        g.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
        broadcast();
      }
      if (left <= 0) endRound('hết giờ');
    } else if (g.phase === 'roundEnd' && Date.now() > g.deadline) nextTurn();
  }, 500);

  return { g, start, choose: (id, i) => { if (id === g.drawerId) choose(i); }, stroke };
}
