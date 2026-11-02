// 🌦️ Thời tiết đồng bộ + 🎣 câu cá ở hồ (bộ sưu tập lưu ra đĩa).
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rateLimiter } from './world.js';

// ---------------- Thời tiết ----------------
export const WEATHERS = ['clear', 'rain', 'sakura', 'snow'];
const WEATHER_NAME = { clear: '☀️ trời nắng', rain: '🌧️ mưa', sakura: '🌸 hoa đào rơi', snow: '❄️ tuyết' };
const COMMANDS = { '/mua': 'rain', '/mưa': 'rain', '/nang': 'clear', '/nắng': 'clear', '/tuyet': 'snow', '/tuyết': 'snow', '/hoadao': 'sakura', '/hoa': 'sakura', '/hoađào': 'sakura' };

/** Chọn thời tiết ngẫu nhiên có trọng số (nắng nhiều nhất). */
export function pickWeather(roll = randomInt(100)) {
  return roll < 45 ? 'clear' : roll < 70 ? 'sakura' : roll < 90 ? 'rain' : 'snow';
}

// ---------------- Câu cá ----------------
export const FISH = [
  { id: 'ro', name: 'Cá rô đồng', icon: '🐟', rarity: 'thường', w: [0.1, 0.4], chance: 16, pts: 10 },
  { id: 'chep', name: 'Cá chép', icon: '🐟', rarity: 'thường', w: [0.5, 3.5], chance: 14, pts: 15 },
  { id: 'ròphi', name: 'Cá rô phi', icon: '🐠', rarity: 'thường', w: [0.3, 1.2], chance: 14, pts: 12 },
  { id: 'tre', name: 'Cá trê', icon: '🐟', rarity: 'thường', w: [0.4, 2], chance: 10, pts: 15 },
  { id: 'loc', name: 'Cá lóc', icon: '🐟', rarity: 'thường', w: [0.6, 3], chance: 9, pts: 20 },
  { id: 'tom', name: 'Tôm càng xanh', icon: '🦐', rarity: 'thường', w: [0.05, 0.25], chance: 8, pts: 18 },
  { id: 'cua', name: 'Cua đồng', icon: '🦀', rarity: 'thường', w: [0.05, 0.2], chance: 6, pts: 18 },
  { id: 'koido', name: 'Cá Koi đỏ', icon: '🎏', rarity: 'hiếm', w: [1, 5], chance: 4, pts: 60 },
  { id: 'koivang', name: 'Cá Koi vàng', icon: '✨', rarity: 'hiếm', w: [1, 6], chance: 3, pts: 80 },
  { id: 'luon', name: 'Lươn', icon: '🪱', rarity: 'hiếm', w: [0.2, 1], chance: 3, pts: 50 },
  { id: 'rua', name: 'Rùa Vàng Hồ Gươm', icon: '🐢', rarity: 'huyền thoại', w: [20, 80], chance: 0.7, pts: 500 },
  { id: 'dep', name: 'Chiếc dép tổ ong', icon: '🩴', rarity: 'rác', w: [0.2, 0.3], chance: 6, pts: 1 },
  { id: 'lon', name: 'Lon nước ngọt', icon: '🥫', rarity: 'rác', w: [0.02, 0.05], chance: 4, pts: 1 },
  { id: 'rong', name: 'Mớ rong rêu', icon: '🌿', rarity: 'rác', w: [0.1, 0.4], chance: 2.3, pts: 1 },
];
const TOTAL = FISH.reduce((a, f) => a + f.chance, 0);
/** Bốc cá theo tỉ lệ. roll ∈ [0, 1). */
export function pickFish(roll = Math.random()) {
  let x = roll * TOTAL;
  for (const f of FISH) { if ((x -= f.chance) < 0) return f; }
  return FISH[0];
}
export const BITE_WINDOW_MS = 1500;

export function registerFeatures(io, world, { lake }) {
  // ---- thời tiết ----
  let weather = { type: 'clear', since: Date.now() };
  const setWeather = (type, by) => {
    if (!WEATHERS.includes(type) || type === weather.type) return;
    weather = { type, since: Date.now() };
    io.emit('weather', weather);
    io.emit('chat:message', { system: true, text: by ? `${WEATHER_NAME[type]} – ${by} vừa đổi thời tiết!` : `Thời tiết chuyển sang ${WEATHER_NAME[type]}`, ts: Date.now() });
  };
  const nextChange = () => setTimeout(() => { setWeather(pickWeather()); nextChange(); }, (5 + randomInt(4)) * 60_000);
  nextChange();
  const cmdLimit = rateLimiter(1, 20_000);
  world.chatFilters.unshift((p, text, socket) => {
    const cmd = text.trim().toLowerCase().split(/\s+/)[0];
    if (cmd === '/help' || cmd === '/lenh') {
      io.to(p.id).emit('chat:message', { system: true, text: 'Lệnh bí mật: /mua · /nang · /tuyet · /hoadao (đổi thời tiết cho cả sảnh)', ts: Date.now() });
      return true;
    }
    if (!COMMANDS[cmd]) return false;
    if (!cmdLimit(p.id)) { io.to(p.id).emit('chat:message', { system: true, text: '⛅ Trời đang bận đổi, đợi chút rồi cầu tiếp nhé', ts: Date.now() }); return true; }
    setWeather(COMMANDS[cmd], p.name);
    void socket;
    return true;
  });

  // ---- câu cá ----
  const DIR = process.env.GALLERY_DIR || path.join(os.tmpdir(), 'hoiquan-gallery');
  mkdirSync(DIR, { recursive: true });
  const FILE = path.join(DIR, 'fish.json');
  /** @type {Record<string, {points:number, total:number, species: Record<string,{count:number,best:number}>}>} */
  let book = {};
  try { book = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* lần đầu */ }
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { writeFileSync(FILE, JSON.stringify(book)); } catch {} }, 1000); };
  const sessions = new Map(); // id -> { state, biteAt, timers }
  const nearLake = (p) => {
    const x = p.x / 16, z = p.y / 16;
    return p.room === 'lobby' && x > lake.x - 1.8 && x < lake.x + lake.w + 1.8 && z > lake.y - 1.8 && z < lake.y + lake.h + 1.8;
  };
  const stop = (id, notify = true) => {
    const s = sessions.get(id);
    if (!s) return;
    s.timers.forEach(clearTimeout);
    sessions.delete(id);
    if (notify) io.emit('fish:state', { id, fishing: false });
  };
  const leaderboard = () => Object.entries(book).map(([name, b]) => ({ name, points: b.points, total: b.total, kinds: Object.keys(b.species).length }))
    .sort((a, b) => b.points - a.points).slice(0, 10);
  const collectionOf = (name) => book[name] || { points: 0, total: 0, species: {} };

  io.on('connection', (socket) => {
    socket.on('fish:cast', (d) => {
      const p = world.get(socket.id);
      if (!p || !nearLake(p) || sessions.has(p.id)) return;
      const bx = Number(d?.x), bz = Number(d?.z);
      const s = { state: 'waiting', biteAt: 0, timers: [] };
      sessions.set(p.id, s);
      io.emit('fish:state', { id: p.id, fishing: true, x: Number.isFinite(bx) ? bx : p.x / 16, z: Number.isFinite(bz) ? bz : p.y / 16 });
      s.timers.push(setTimeout(() => {
        s.state = 'bite'; s.biteAt = Date.now();
        io.emit('fish:bite', { id: p.id });
        s.timers.push(setTimeout(() => { if (s.state === 'bite') { socket.emit('fish:result', { escaped: true }); stop(p.id); } }, BITE_WINDOW_MS + 400));
      }, 2500 + randomInt(5500)));
    });
    socket.on('fish:reel', () => {
      const p = world.get(socket.id), s = p && sessions.get(p.id);
      if (!s) return;
      if (s.state !== 'bite') { socket.emit('fish:result', { early: true }); return stop(p.id); }
      const f = pickFish();
      const weight = Math.round((f.w[0] + Math.random() * (f.w[1] - f.w[0])) * 100) / 100;
      const b = (book[p.name] ||= { points: 0, total: 0, species: {} });
      const sp = (b.species[f.id] ||= { count: 0, best: 0 });
      const isNew = sp.count === 0;
      sp.count++; sp.best = Math.max(sp.best, weight);
      b.total++; b.points += f.pts;
      save();
      socket.emit('fish:result', { fish: { id: f.id, name: f.name, icon: f.icon, rarity: f.rarity, pts: f.pts }, weight, isNew });
      if (f.rarity === 'hiếm' || f.rarity === 'huyền thoại') {
        io.emit('chat:message', { system: true, text: `🎣 ${p.name} câu được ${f.icon} ${f.name} (${f.rarity}!) nặng ${weight}kg`, ts: Date.now() });
      }
      io.emit('fish:caught', { id: p.id, icon: f.icon });
      stop(p.id);
    });
    socket.on('fish:stop', () => stop(socket.id));
    socket.on('fish:book', () => {
      const p = world.get(socket.id);
      if (p) socket.emit('fish:book', { mine: collectionOf(p.name), fish: FISH.map(({ id, name, icon, rarity, pts }) => ({ id, name, icon, rarity, pts })), top: leaderboard() });
    });
    socket.on('weather:sync', () => socket.emit('weather', weather));
    socket.on('disconnect', () => stop(socket.id, true));
  });
  // rời sảnh (vào phòng) hoặc đi xa hồ → dừng câu
  world.events.on('room', ({ p }) => stop(p.id));
  setInterval(() => { for (const id of sessions.keys()) { const p = world.get(id); if (!p || !nearLake(p)) stop(id); } }, 1000);

  return { setWeather, get weather() { return weather; } };
}
