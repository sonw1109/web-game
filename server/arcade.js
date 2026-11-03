// 🕹️ Khu Trò Chơi – Bảng Vàng chung cho mọi game nhỏ (lưu ra đĩa để restart không mất).
// Điểm tính theo TÊN người chơi (đổi máy / tải lại trang vẫn giữ). Bot không lên bảng.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ARCADE_IDS } from '../client/src/game/arcade.js';
import { reply, rateLimiter } from './world.js';

const MAX_NAMES = 2000;       // chặn bảng phình vô hạn
const MAX_PTS = 1e9;

/** Phần lõi (không I/O) để test. */
export function createBoard(data = {}) {
  /** games[game][name] = { pts, wins, best } */
  const games = Object.create(null);
  for (const id of ARCADE_IDS) {
    games[id] = Object.create(null);
    const src = data?.[id];
    if (src && typeof src === 'object') {
      for (const [name, v] of Object.entries(src)) {
        if (typeof name !== 'string' || name.length > 16 || !v || typeof v !== 'object') continue;
        games[id][name] = { pts: clamp(v.pts), wins: clamp(v.wins), best: clamp(v.best) };
      }
    }
  }
  const total = () => {
    const sum = Object.create(null);
    for (const id of ARCADE_IDS) for (const [n, v] of Object.entries(games[id])) sum[n] = (sum[n] || 0) + v.pts;
    return sum;
  };
  return {
    games,
    /** Cộng điểm. win: tính 1 ván thắng · best: điểm kỷ lục 1 ván (giữ max). */
    award(game, name, pts = 0, { win = false, best } = {}) {
      const g = games[game];
      if (!g || typeof name !== 'string' || !name) return false;
      if (!g[name]) {
        if (Object.keys(g).length >= MAX_NAMES) return false;
        g[name] = { pts: 0, wins: 0, best: 0 };
      }
      const r = g[name];
      r.pts = clamp(r.pts + (Number.isFinite(pts) ? Math.round(pts) : 0));
      if (win) r.wins = clamp(r.wins + 1);
      if (Number.isFinite(best)) r.best = Math.max(r.best, clamp(best));
      return true;
    },
    /** Top n của 1 game (hoặc tổng mọi game nếu game = 'all'). */
    top(game = 'all', n = 10) {
      if (game === 'all') {
        return Object.entries(total()).map(([name, pts]) => ({ name, pts })).sort((a, b) => b.pts - a.pts).slice(0, n);
      }
      const g = games[game];
      if (!g) return [];
      const key = game === 'g2048' ? 'best' : 'pts';
      return Object.entries(g).map(([name, v]) => ({ name, ...v })).sort((a, b) => b[key] - a[key] || b.wins - a.wins).slice(0, n);
    },
    toJSON() { return games; },
  };
}
function clamp(v) { v = Math.round(+v || 0); return Math.max(-MAX_PTS, Math.min(MAX_PTS, v)); }

export function registerArcade(io, world) {
  const DIR = process.env.GALLERY_DIR || path.join(os.tmpdir(), 'hoiquan-gallery');
  const FILE = path.join(DIR, 'arcade.json');
  let saved = {};
  try { mkdirSync(DIR, { recursive: true }); saved = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* lần đầu */ }
  const board = createBoard(saved);
  let saveT = null;
  const save = () => {
    if (saveT) return;
    saveT = setTimeout(() => { saveT = null; try { writeFileSync(FILE, JSON.stringify(board)); } catch (e) { console.warn('[arcade] save', e.message); } }, 2000);
  };

  const topLimit = rateLimiter(10, 10_000);
  io.on('connection', (socket) => {
    socket.on('arcade:top', (game, ack) => {
      if (!topLimit(socket.id)) return reply(ack, { error: 'Chậm lại chút' });
      const g = typeof game === 'string' && (game === 'all' || ARCADE_IDS.includes(game)) ? game : 'all';
      reply(ack, { game: g, top: board.top(g, 10) });
    });
  });

  // Người vừa rớt mạng: world đã xóa họ trước khi game kịp tính điểm ván dang dở → nhớ tên thêm 15 giây
  const gone = new Map(); // id -> { p, at }
  world.events.on('room', ({ p, room }) => {
    if (room !== null || p?.bot) return;
    const now = Date.now();
    gone.set(p.id, { p, at: now });
    for (const [k, v] of gone) if (now - v.at > 15_000) gone.delete(k);
  });

  return {
    board,
    /** Cộng điểm cho người chơi theo socket id (bot bị bỏ qua). */
    award(game, playerId, pts, opts) {
      const p = world.get(playerId) || gone.get(playerId)?.p;
      if (!p || p.bot) return false;
      const ok = board.award(game, p.name, pts, opts);
      if (ok) save();
      return ok;
    },
  };
}
