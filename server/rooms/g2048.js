// 🔷 2048 – mỗi người 1 ván riêng. Client chơi tại máy, gửi từng nước lên; server chơi lại y hệt
// (cùng trạng thái RNG) nên điểm server là chuẩn. Chỉ lưu trạng thái hiện tại, không lưu lịch sử.
import { randomInt } from 'node:crypto';
import { newGame, move, DIRS, maxTile } from '../../client/src/game/g2048.js';
import { reply, rateLimiter } from '../world.js';

export const MAX_MOVES = 30_000;    // chống ván vô hạn
const TOP_N = 10;
const MAX_TOP_NAMES = 200;

/** Phần lõi (không socket) để test. */
export function create2048({ seed = () => randomInt(0, 2 ** 31) } = {}) {
  /** id → { g: trạng thái ván, best: kỷ lục trong phiên, done: đã chốt điểm ván này chưa } */
  const games = new Map();
  /** Kỷ lục trong phòng theo tên: name → điểm */
  const top = Object.create(null);

  const recordTop = (name, score) => {
    if (typeof name !== 'string' || !name || score <= 0) return;
    if (!(name in top) && Object.keys(top).length >= MAX_TOP_NAMES) {
      // bỏ người thấp nhất để chừa chỗ
      const [low] = Object.entries(top).sort((a, b) => a[1] - b[1]);
      if (!low || low[1] >= score) return;
      delete top[low[0]];
    }
    top[name] = Math.max(top[name] || 0, score);
  };

  return {
    games, top,
    /** Bắt đầu ván mới (chốt ván cũ nếu có). Trả { finished: ván cũ đã chốt | null } */
    start(id) {
      const old = games.get(id);
      const finished = old && !old.done && old.g.score > 0 ? { score: old.g.score } : null;
      games.set(id, { g: newGame(seed()), best: Math.max(old?.best || 0, old?.g.score || 0), done: false });
      return finished;
    },
    /** Đi 1 nước. → { ok, ended } ; ok=false nếu không có ván / hướng sai / nước không đổi gì. */
    move(id, dir) {
      const p = games.get(id);
      if (!p || p.done || typeof dir !== 'string' || !DIRS.includes(dir)) return { ok: false };
      const r = move(p.g, dir);
      if (!r.moved) return { ok: false };
      p.g = r.state;
      if (p.g.moves >= MAX_MOVES) p.g.over = true;
      p.best = Math.max(p.best, p.g.score);
      if (p.g.over) { p.done = true; return { ok: true, ended: true }; }
      return { ok: true, ended: false };
    },
    /** Chốt ván (rời phòng / hết nước): trả điểm cần ghi hoặc null. */
    finish(id) {
      const p = games.get(id);
      if (!p) return null;
      const s = p.g.score;
      p.done = true;
      return s > 0 ? { score: s } : null;
    },
    leave(id) { games.delete(id); },
    recordTop,
    topList: () => Object.entries(top).map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score).slice(0, TOP_N),
    privateView(id) {
      const p = games.get(id);
      if (!p) return { game: null, best: 0 };
      const { board, score, rng, moves, over } = p.g;
      return { game: { board, score, rng, moves, over }, best: p.best };
    },
  };
}

export function register(io, world, arcade) {
  const core = create2048();
  const ROOM = 'room:g2048';
  const here = (id) => world.get(id)?.room === 'g2048';
  const moveLimit = rateLimiter(20, 1000);
  const newLimit = rateLimiter(4, 5000);
  const syncLimit = rateLimiter(10, 5000);
  let dirty = false;

  const publicView = () => {
    const players = [];
    for (const [id, p] of core.games) {
      const w = world.get(id);
      if (!w || w.room !== 'g2048') continue;
      players.push({ id, name: w.name, score: p.g.score, max: maxTile(p.g.board), over: p.g.over });
    }
    players.sort((a, b) => b.score - a.score);
    return { players, top: core.topList() };
  };
  const sendPrivate = (socket) => socket.emit('g2048:state', core.privateView(socket.id));

  /** Chốt ván 1 người: ghi Bảng Vàng + bảng phòng. */
  const settle = (id, res, name = world.get(id)?.name) => {
    if (!res) return;
    core.recordTop(name, res.score);
    arcade?.award('g2048', id, Math.floor(res.score / 100), { best: res.score });
    if (res.score >= 2000 && name) {
      io.to(ROOM).emit('chat:message', { system: true, text: `🔷 2048: ${name} kết thúc ván với ${res.score} điểm!`, ts: Date.now() });
    }
    dirty = true;
  };

  io.on('connection', (socket) => {
    socket.on('g2048:sync', () => {
      if (!here(socket.id) || !syncLimit(socket.id)) return;
      sendPrivate(socket);
      socket.emit('g2048:room', publicView());
    });
    socket.on('g2048:new', () => {
      if (!here(socket.id)) return;
      if (!newLimit(socket.id)) return sendPrivate(socket);
      settle(socket.id, core.start(socket.id));
      dirty = true;
      sendPrivate(socket);
    });
    socket.on('g2048:move', (dir, ack) => {
      if (!here(socket.id)) return reply(ack, { ok: false });
      if (!moveLimit(socket.id)) { sendPrivate(socket); return reply(ack, { ok: false, resync: true }); }
      const r = core.move(socket.id, dir);
      const p = core.games.get(socket.id);
      if (!r.ok) {
        // client tưởng đi được mà server thì không → lệch: gửi trạng thái chuẩn về
        if (p) sendPrivate(socket);
        return reply(ack, { ok: false, resync: !!p });
      }
      dirty = true;
      if (r.ended) { settle(socket.id, { score: p.g.score }); sendPrivate(socket); }
      reply(ack, { ok: true, moves: p.g.moves, score: p.g.score });
    });
  });

  world.events.on('room', ({ p, prev }) => {
    if (prev !== 'g2048') return;
    const g = core.games.get(p.id);
    if (g && !g.done) settle(p.id, core.finish(p.id), p.name);
    core.leave(p.id);
    dirty = true;
  });

  // Phát bảng điểm phòng tối đa 1 lần / giây (không phát mỗi nước)
  const timer = setInterval(() => {
    if (!dirty) return;
    dirty = false;
    io.to(ROOM).emit('g2048:room', publicView());
  }, 1000);
  timer.unref?.();

  return { core };
}
