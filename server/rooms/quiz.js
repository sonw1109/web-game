// ❓ Quiz nhiều người: 10 câu, 15s/câu, điểm theo tốc độ.
import { readFileSync } from 'node:fs';

const BANK = JSON.parse(readFileSync(new URL('../data/quiz-vi.json', import.meta.url), 'utf8'));
export const QUESTIONS_PER_GAME = 10;
export const QUESTION_MS = 15_000;
export const REVEAL_MS = 5_000;
export const LEAD_IN_MS = 3_000;

/** Đúng: 500 + tối đa 500 điểm thưởng tốc độ. Sai/không trả lời: 0. */
export const quizPoints = (correct, remainingMs, totalMs = QUESTION_MS) =>
  correct ? 500 + Math.round(500 * Math.max(0, Math.min(1, remainingMs / totalMs))) : 0;

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Trộn thứ tự đáp án để không ai nhớ vị trí. */
export function prepareQuestion(raw) {
  const order = shuffle([0, 1, 2, 3]);
  return { q: raw.q, a: order.map((i) => raw.a[i]), c: order.indexOf(raw.c) };
}

export function registerQuiz(io, world) {
  const ROOM = 'room:quiz';
  const g = {
    phase: 'idle',          // idle | countdown | question | reveal | over
    questions: [], index: -1,
    deadline: 0,
    answers: new Map(),     // id -> { choice, remainingMs }
    scores: new Map(),      // id -> { name, score, last }
    hostId: null,
  };
  const members = () => world.inRoom('quiz');
  const remaining = () => Math.max(0, g.deadline - Date.now());
  const cur = () => g.questions[g.index];

  const board = () => [...g.scores.entries()]
    .map(([id, s]) => ({ id, name: world.get(id)?.name ?? s.name, score: s.score, last: s.last }))
    .sort((a, b) => b.score - a.score);

  const view = () => {
    const q = cur();
    return {
      phase: g.phase,
      index: g.index, total: g.questions.length,
      remainingMs: remaining(),
      totalMs: g.phase === 'question' ? QUESTION_MS : g.phase === 'reveal' ? REVEAL_MS : LEAD_IN_MS,
      question: q && (g.phase === 'question' || g.phase === 'reveal') ? { q: q.q, a: q.a } : null,
      correct: g.phase === 'reveal' ? q.c : null,
      answeredIds: [...g.answers.keys()],
      reveal: g.phase === 'reveal' ? Object.fromEntries([...g.answers].map(([id, a]) => [id, a.choice])) : null,
      board: board(),
      members: members().map((p) => ({ id: p.id, name: p.name })),
    };
  };
  const broadcast = () => io.to(ROOM).emit('quiz:state', view());
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });

  function nextQuestion() {
    g.index++;
    if (g.index >= g.questions.length) {
      g.phase = 'over'; g.deadline = 0;
      const top = board()[0];
      if (top) sys(`🏆 Quiz: ${top.name} vô địch với ${top.score} điểm!`);
      return broadcast();
    }
    g.phase = 'question';
    g.answers = new Map();
    g.deadline = Date.now() + QUESTION_MS;
    broadcast();
  }

  function reveal() {
    if (g.phase !== 'question') return;
    const q = cur();
    for (const s of g.scores.values()) s.last = 0;
    for (const [id, a] of g.answers) {
      const s = g.scores.get(id);
      if (!s) continue;
      s.last = quizPoints(a.choice === q.c, a.remainingMs);
      s.score += s.last;
    }
    g.phase = 'reveal';
    g.deadline = Date.now() + REVEAL_MS;
    broadcast();
  }

  io.on('connection', (socket) => {
    const inRoom = () => world.get(socket.id)?.room === 'quiz';
    socket.on('quiz:sync', () => inRoom() && socket.emit('quiz:state', view()));
    socket.on('quiz:start', () => start(socket.id));
    socket.on('quiz:restart', () => {
      if (world.get(socket.id)?.room !== 'quiz') return;
      g.phase = 'idle';
      start(socket.id);
    });
    socket.on('quiz:answer', (choice) => answer(socket.id, choice));
  });

  function start(id) {
      if (world.get(id)?.room !== 'quiz' || !['idle', 'over'].includes(g.phase)) return;
      g.questions = shuffle([...BANK]).slice(0, QUESTIONS_PER_GAME).map(prepareQuestion);
      g.index = -1;
      g.scores = new Map(members().map((p) => [p.id, { name: p.name, score: 0, last: 0 }]));
      g.phase = 'countdown';
      g.deadline = Date.now() + LEAD_IN_MS;
      sys(`❓ ${world.get(id)?.name} bắt đầu Quiz – ${g.questions.length} câu!`);
      broadcast();
  }

  function answer(id, choice) {
    if (world.get(id)?.room !== 'quiz' || g.phase !== 'question' || g.answers.has(id)) return;
    const c = Number(choice);
    if (![0, 1, 2, 3].includes(c)) return;
    if (!g.scores.has(id)) g.scores.set(id, { name: world.get(id).name, score: 0, last: 0 });
    g.answers.set(id, { choice: c, remainingMs: remaining() });
    if (members().every((p) => g.answers.has(p.id))) reveal();
    else broadcast();
  }

  world.events.on('room', ({ p, room, prev }) => {
    if (room === 'quiz' && g.phase !== 'idle' && g.phase !== 'over' && !g.scores.has(p.id)) {
      g.scores.set(p.id, { name: p.name, score: 0, last: 0 });
    }
    if (prev !== 'quiz' && room !== 'quiz') return;
    if (members().length === 0 && g.phase !== 'idle') { g.phase = 'idle'; g.deadline = 0; return; }
    if (g.phase === 'question' && members().length && members().every((m) => g.answers.has(m.id))) return reveal();
    broadcast();
  });

  setInterval(() => {
    if (g.phase === 'countdown' && Date.now() > g.deadline) nextQuestion();
    else if (g.phase === 'question' && Date.now() > g.deadline) reveal();
    else if (g.phase === 'reveal' && Date.now() > g.deadline) nextQuestion();
  }, 250);

  return { g, start, answer, current: cur };
}
