// 🤖 Bot chơi cùng: khi có người vào phòng game mà chỉ có 1 mình, bot tự vào chơi.
// Tắt bằng biến môi trường BOTS=off.
import { readFileSync } from 'node:fs';
import { bestMove } from './caroAI.js';

const WORDS = JSON.parse(readFileSync(new URL('../data/words-vi.json', import.meta.url), 'utf8'));
const GAME_ROOMS = ['caro', 'draw', 'quiz'];
const BOT = {
  caro: { name: '🤖 Bot Cờ', appearance: { skin: '#f1c27d', hair: '#1b1b1f', hairStyle: 2, shirt: '#2b2d42', pants: '#5b5f6a' } },
  draw: { name: '🤖 Bot Họa Sĩ', appearance: { skin: '#ffdbac', hair: '#e0487a', hairStyle: 1, shirt: '#ffd166', pants: '#1f2a5a' } },
  quiz: { name: '🤖 Bot Thông Thái', appearance: { skin: '#e0ac69', hair: '#d9d9e3', hairStyle: 3, shirt: '#3ddc97', pants: '#2d3446' } },
};
const WRONG_GUESSES = ['là gì ta 🤔', 'khó quá', 'hmm…', 'vẽ đẹp ghê', 'gợi ý đi'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function registerBots(world, { caro, draw, quiz }) {
  if (process.env.BOTS === 'off') return;
  const botId = (room) => `bot-${room}`;
  const humans = (room) => world.inRoom(room).filter((p) => !p.bot);

  // Hẹn giờ không trùng lặp: mỗi key chỉ có 1 việc đang chờ
  const pending = new Map();
  const schedule = (key, ms, fn) => {
    if (pending.has(key)) return;
    pending.set(key, setTimeout(() => { pending.delete(key); fn(); }, ms));
  };
  const cancelPrefix = (prefix) => {
    for (const [k, t] of pending) if (k.startsWith(prefix)) { clearTimeout(t); pending.delete(k); }
  };

  // ---------- Vào / rời phòng ----------
  function syncBots() {
    for (const room of GAME_ROOMS) {
      const id = botId(room), has = !!world.get(id), n = humans(room).length;
      if (n > 0 && !has) {
        world.addBot(id, BOT[room].name, BOT[room].appearance, room);
        world.io.to(`room:${room}`).emit('chat:message', { system: true, text: `${BOT[room].name} đã vào chơi cùng bạn`, ts: Date.now() });
      } else if (n === 0 && has) {
        cancelPrefix(room);
        world.removeBot(id);
      }
    }
  }
  world.events.on('room', ({ p }) => { if (!p.bot) setTimeout(syncBots, 700); });

  // ---------- ⭕ Caro ----------
  function tickCaro() {
    const id = botId('caro');
    if (!world.get(id)) return;
    const { game } = caro;
    const s = game.s;
    const seat = game.seatOf(id);
    const humanSeat = ['X', 'O'].find((k) => s.seats[k] && s.seats[k] !== id);
    const waitingHumans = humans('caro').filter((h) => !game.seatOf(h.id));

    if (!seat) {
      // Ngồi vào khi có người đang chờ đối thủ và không còn ai khác muốn chơi
      if (humanSeat && s.status !== 'playing' && waitingHumans.length === 0) {
        schedule('caro-sit', 1200, () => {
          const free = ['X', 'O'].find((k) => !game.s.seats[k]);
          if (free) caro.act(id, 'sit', free);
        });
      }
      return;
    }
    if (s.status !== 'playing' && (!humanSeat || waitingHumans.length > 0)) {
      // Người chơi đứng dậy, hoặc có người khác đang chờ → nhường ghế
      schedule('caro-stand', 800, () => caro.act(id, 'stand'));
      return;
    }
    if (s.status === 'playing' && s.turn === seat) {
      schedule(`caro-move-${s.board.filter(Boolean).length}`, rnd(600, 1400), () => {
        if (game.s.status !== 'playing' || game.s.turn !== seat) return;
        caro.act(id, 'move', bestMove(game.s.board, seat));
      });
    }
  }

  // ---------- 🎨 Vẽ & Đoán ----------
  function doodle() {
    // Vài hình đơn giản: tròn, sóng, chữ nhật, nét nguệch ngoạc
    const shapes = [];
    const cx = rnd(300, 700), cy = rnd(250, 500), r = rnd(80, 180);
    const circle = []; for (let a = 0; a <= 40; a++) circle.push(cx + r * Math.cos(a / 40 * Math.PI * 2), cy + r * Math.sin(a / 40 * Math.PI * 2));
    shapes.push({ c: pick(['#1b1b1f', '#e03131', '#1c7ed6']), s: 8, pts: circle });
    const wave = []; for (let t = 0; t <= 30; t++) wave.push(150 + t * 23, 800 * 0.75 + 60 * Math.sin(t / 3));
    shapes.push({ c: '#37b24d', s: 6, pts: wave });
    const x0 = rnd(100, 400), y0 = rnd(80, 200), w = rnd(150, 300), h = rnd(80, 160);
    shapes.push({ c: '#f76707', s: 5, pts: [x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h, x0, y0] });
    const scrib = []; let x = rnd(200, 800), y = rnd(150, 600);
    for (let k = 0; k < 25; k++) { x += rnd(-40, 40); y += rnd(-40, 40); scrib.push(x, y); }
    shapes.push({ c: '#7048e8', s: 4, pts: scrib });
    return shapes.map((sh) => ({ ...sh, pts: sh.pts.map((v) => Math.max(0, Math.min(1000, Math.round(v)))) }));
  }

  function tickDraw() {
    const id = botId('draw');
    const bot = world.get(id);
    if (!bot) return;
    const g = draw.g;
    const key = `draw-${g.turn}`;

    if (g.phase === 'choosing' && g.drawerId === id) {
      schedule(`${key}-choose`, 2000, () => draw.choose(id, Math.floor(Math.random() * 3)));
    } else if (g.phase === 'drawing' && g.drawerId === id) {
      // Vẽ từ từ từng đoạn cho giống người
      schedule(`${key}-draw`, 800, () => {
        const shapes = doodle();
        let delay = 0;
        shapes.forEach((sh, si) => {
          const sid = `b${g.turn}_${si}`;
          for (let i = 0; i < sh.pts.length; i += 16) {
            const chunk = sh.pts.slice(Math.max(0, i - 2), i + 16);
            delay += 120;
            setTimeout(() => {
              if (draw.g.phase === 'drawing' && draw.g.drawerId === id) draw.stroke(id, { sid, c: sh.c, s: sh.s, pts: i === 0 ? sh.pts.slice(0, 16) : chunk }, null);
            }, delay);
          }
          delay += 600;
        });
      });
    } else if (g.phase === 'drawing' && g.drawerId !== id && !g.guessed.has(id)) {
      // Đoán: vài câu linh tinh, rồi 75% đoán đúng sau 12–45 giây
      schedule(`${key}-chat1`, rnd(5000, 12000), () => {
        if (draw.g.phase === 'drawing') world.say(world.get(id), Math.random() < 0.5 ? pick(WORDS) : pick(WRONG_GUESSES));
      });
      schedule(`${key}-guess`, rnd(12000, 45000), () => {
        if (draw.g.phase !== 'drawing' || draw.g.guessed.has(id) || Math.random() > 0.75) return;
        world.say(world.get(id), draw.g.word);
      });
    }
  }

  // ---------- ❓ Quiz ----------
  function tickQuiz() {
    const id = botId('quiz');
    if (!world.get(id)) return;
    const g = quiz.g;
    if (g.phase !== 'question' || g.answers.has(id)) return;
    const index = g.index;
    schedule(`quiz-${index}`, rnd(2500, 10000), () => {
      if (quiz.g.phase !== 'question' || quiz.g.index !== index) return;
      const correct = quiz.current().c;
      const wrong = [0, 1, 2, 3].filter((i) => i !== correct);
      quiz.answer(id, Math.random() < 0.65 ? correct : pick(wrong));
    });
  }

  setInterval(() => {
    try { tickCaro(); tickDraw(); tickQuiz(); } catch (e) { console.error('[bots]', e); }
  }, 400);
}
