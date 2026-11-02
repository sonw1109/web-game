// Quản lý người chơi trên bản đồ chung: vị trí, phòng, chat, emoji.
import { EventEmitter } from 'node:events';
const TICK_MS = 1000 / 15;
const EMOJIS = ['😂', '❤️', '👍', '😮', '😢', '🔥'];
const ROOMS = new Set(['lobby', 'cinema', 'draw', 'quiz', 'caro', 'gallery', 'typing', 'baucua']);

/** Gọi callback của client nếu có (client có thể gửi rác thay vì hàm). */
export const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

/** Giới hạn tốc độ: tối đa `n` lần trong `ms` mili-giây cho mỗi key. */
export function rateLimiter(n, ms) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < ms);
    if (arr.length >= n) { hits.set(key, arr); return false; }
    arr.push(now); hits.set(key, arr);
    return true;
  };
}
const chatLimit = rateLimiter(6, 4000);   // tối đa 6 tin / 4 giây
const guessLimit = rateLimiter(15, 5000); // phòng Vẽ: đoán dồn dập là bình thường → nới hơn
const emojiLimit = rateLimiter(5, 2000);  // tối đa 5 emoji / 2 giây
const emoteLimit = rateLimiter(4, 3000);  // hành động (nhảy, cúi chào…)
const fxLimit = rateLimiter(1, 8000);     // pháo hoa: 1 lần / 8 giây mỗi người
export const EMOTES = ['dance', 'bow', 'wave', 'spin'];

const clampStr = (s, n) => String(s ?? '').trim().slice(0, n);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

export function sanitizeAppearance(a) {
  if (!a || typeof a !== 'object') a = {};
  const color = (c, d) => (/^#[0-9a-f]{6}$/i.test(c) ? c : d);
  return {
    skin: color(a.skin, '#f1c27d'),
    hair: color(a.hair, '#3b2a20'),
    hairStyle: Math.max(0, Math.min(3, Math.floor(num(a.hairStyle)))),
    pet: Math.max(0, Math.min(4, Math.floor(num(a.pet)))), // 0 = không có, 1 mèo, 2 cún, 3 gà con, 4 thỏ
    shirt: color(a.shirt, '#4f8cff'),
    pants: color(a.pants, '#2d3446'),
  };
}

export function registerWorld(io) {
  /** @type {Map<string, any>} */
  const players = new Map();
  const events = new EventEmitter();   // 'room' khi ai đó đổi phòng / rời đi
  const chatFilters = [];              // (p, text) => true nếu tin nhắn đã bị phòng game "nuốt" (vd. đoán từ)
  let dirty = false;

  const publicPlayer = (p) => ({
    id: p.id, name: p.name, appearance: p.appearance,
    x: p.x, y: p.y, dir: p.dir, moving: p.moving, room: p.room, bot: !!p.bot, rot: p.rot ?? 0,
  });

  /** Đổi phòng (dùng chung cho người thật và bot – bot không có socket). */
  function changeRoom(p, room, socket) {
    if (!ROOMS.has(room) || p.room === room) return;
    const prev = p.room;
    socket?.leave(`room:${prev}`);
    socket?.join(`room:${room}`);
    p.room = room;
    io.emit('world:roomChanged', { id: p.id, room, prev });
    events.emit('room', { socket, p, room, prev });
  }

  /** Gửi chat (qua bộ lọc của phòng game, vd. đoán từ). */
  function say(p, text) {
    const t = clampStr(text, 200);
    if (!p || !t) return;
    for (const f of chatFilters) if (f(p, t)) return;
    io.emit('chat:message', { id: p.id, name: p.name, room: p.room, text: t, ts: Date.now() });
  }

  io.on('connection', (socket) => {
    socket.on('world:join', (data, ack) => {
      const p = {
        id: socket.id,
        name: clampStr(data?.name, 16) || 'Ẩn danh',
        appearance: sanitizeAppearance(data?.appearance),
        x: num(data?.x, 0), y: num(data?.y, 0),
        dir: 'down', moving: false, room: 'lobby',
      };
      players.set(socket.id, p);
      socket.join('room:lobby');
      reply(ack, { selfId: socket.id, players: [...players.values()].map(publicPlayer) });
      socket.broadcast.emit('world:playerJoined', publicPlayer(p));
      io.emit('chat:message', { system: true, text: `${p.name} vừa vào Hội Quán 👋`, ts: Date.now() });
    });

    socket.on('world:move', (d) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.x = num(d?.x, p.x); p.y = num(d?.y, p.y);
      p.dir = ['up', 'down', 'left', 'right'].includes(d?.dir) ? d.dir : p.dir;
      p.moving = !!d?.moving;
      p.rot = num(d?.rot, p.rot ?? 0); // góc quay (radian) cho bản 3D
      dirty = true;
    });

    socket.on('world:setRoom', (room) => {
      const p = players.get(socket.id);
      if (p) changeRoom(p, room, socket);
    });

    socket.on('chat:send', (text) => {
      const inDraw = players.get(socket.id)?.room === 'draw';
      if (!(inDraw ? guessLimit : chatLimit)(socket.id)) return socket.emit('chat:message', { system: true, text: '🐢 Bạn gửi nhanh quá, chậm lại chút nhé', ts: Date.now() });
      say(players.get(socket.id), text);
    });

    socket.on('emoji:send', (idx) => {
      const p = players.get(socket.id);
      const e = EMOJIS[num(idx, -1)];
      if (p && e && emojiLimit(socket.id)) io.emit('emoji:show', { id: p.id, emoji: e });
    });

    // ---- Hành động & pháo hoa (chỉ ở nơi đi lại được: sảnh, phòng tranh) ----
    socket.on('emote:send', (type) => {
      const p = players.get(socket.id);
      if (p && EMOTES.includes(type) && emoteLimit(socket.id)) io.emit('emote:show', { id: p.id, type });
    });
    socket.on('fx:fireworks', () => {
      const p = players.get(socket.id);
      if (!p || p.room !== 'lobby') return;
      if (!fxLimit(socket.id)) return socket.emit('chat:message', { system: true, text: '🎆 Pháo hoa đang nạp lại, đợi vài giây nhé', ts: Date.now() });
      io.emit('fx:fireworks', { id: p.id, name: p.name, x: p.x, y: p.y });
    });

    // ---- WebRTC signaling: chỉ chuyển tiếp giữa 2 người cùng phòng (không phải lobby) ----
    socket.on('rtc:signal', (msg) => {
      const a = players.get(socket.id), b = players.get(msg?.to);
      if (a && b && a.room === b.room && a.room !== 'lobby') io.to(b.id).emit('rtc:signal', { from: a.id, data: msg.data });
    });
    socket.on('rtc:media', (m) => {
      const p = players.get(socket.id);
      if (p && p.room !== 'lobby') socket.to(`room:${p.room}`).emit('rtc:media', { id: p.id, mic: !!m?.mic, cam: !!m?.cam });
    });

    socket.on('disconnect', () => {
      const p = players.get(socket.id);
      if (!p) return;
      players.delete(socket.id);
      io.emit('world:playerLeft', { id: socket.id, room: p.room });
      events.emit('room', { socket, p, room: null, prev: p.room });
      io.emit('chat:message', { system: true, text: `${p.name} đã rời đi`, ts: Date.now() });
    });
  });

  // Broadcast vị trí ~15 lần/giây khi có thay đổi
  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    const snap = [];
    for (const p of players.values()) snap.push([p.id, Math.round(p.x), Math.round(p.y), p.dir, p.moving ? 1 : 0, Math.round((p.rot ?? 0) * 100) / 100]);
    io.emit('world:snapshot', snap);
  }, TICK_MS);

  return {
    players,
    events,
    chatFilters,
    io,
    get: (id) => players.get(id),
    say,
    changeRoom,
    /** Bot: người chơi ảo không có socket, đứng sẵn trong 1 phòng. */
    addBot(id, name, appearance, room) {
      const p = { id, name, appearance: sanitizeAppearance(appearance), x: 0, y: 0, dir: 'down', moving: false, room, bot: true };
      players.set(id, p);
      io.emit('world:playerJoined', publicPlayer(p));
      events.emit('room', { p, room, prev: 'lobby' });
      return p;
    },
    removeBot(id) {
      const p = players.get(id);
      if (!p?.bot) return;
      players.delete(id);
      io.emit('world:playerLeft', { id, room: p.room });
      events.emit('room', { p, room: null, prev: p.room });
    },
    inRoom: (room) => [...players.values()].filter((p) => p.room === room),
    EMOJIS,
  };
}
