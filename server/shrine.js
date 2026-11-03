// 🙏 Tượng đài Ông Chủ: thắp hương (được phù hộ 5 phút), xin quẻ, cầu nguyện, quỳ lạy, hiển linh.
// Tổng số nén hương & sổ ước nguyện lưu ra đĩa.
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rateLimiter } from './world.js';

export const BLESS_MS = 5 * 60_000;
export const STICK_MS = 180_000;
export const MIRACLE_EVERY = 10;

export const FORTUNES = [
  { level: 'Đại Cát', icon: '🌟', w: 8, text: 'Ông Chủ phán: hôm nay ăn gì cũng ngon, chơi gì cũng thắng!' },
  { level: 'Đại Cát', icon: '🌟', w: 6, text: 'Lộc lá đầy nhà, ví dày như bánh chưng ngày Tết.' },
  { level: 'Thượng Cát', icon: '✨', w: 12, text: 'Tiền vào như nước sông Đà, tiền ra nhỏ giọt như cà phê phin.' },
  { level: 'Thượng Cát', icon: '✨', w: 12, text: 'Có quý nhân phù trợ – rủ bạn đi ăn, bạn sẽ bao.' },
  { level: 'Cát', icon: '🍀', w: 14, text: 'Hôm nay câu cá dễ dính, đặt Bầu Cua nên theo linh cảm.' },
  { level: 'Cát', icon: '🍀', w: 14, text: 'Có người đang thầm nhắc tên bạn… chắc là đòi nợ, nhưng nợ ít thôi.' },
  { level: 'Trung Bình', icon: '🍵', w: 14, text: 'Bình an là phúc. Nhớ uống đủ nước, đứng dậy vươn vai.' },
  { level: 'Trung Bình', icon: '🍵', w: 12, text: 'Việc gì khó quá thì để mai, nhưng mai nhớ làm thật.' },
  { level: 'Tiểu Hung', icon: '🌧️', w: 8, text: 'Cẩn thận ví tiền và đường truyền wifi.' },
  { level: 'Tiểu Hung', icon: '🌧️', w: 6, text: 'Đừng đặt hết điểm vào một ô Bầu Cua nhé.' },
  { level: 'Đại Hung', icon: '⚡', w: 4, text: 'Hôm nay đừng thức khuya. Ông Chủ thấy hết đấy 👀 – thắp nén hương để giải hạn!' },
];
const FTOTAL = FORTUNES.reduce((a, f) => a + f.w, 0);
/** Bốc quẻ theo trọng số. roll ∈ [0, FTOTAL). */
export function pickFortune(roll = randomInt(FTOTAL)) {
  let x = roll;
  for (const f of FORTUNES) { if ((x -= f.w) < 0) return f; }
  return FORTUNES[0];
}

/** Ông Chủ "đáp lời" sau khi nghe cầu nguyện. */
export const REPLIES = [
  'Ông Chủ đã nghe thấy rồi nhé 🙏', 'Chuẩn bị nhận lộc nha con ✨', 'Được! Nhưng phải chăm chỉ đã 😌', 'Ừ, để Ông Chủ sắp xếp 👌',
  'Lời nguyện đã được ghi vào sổ 📜', 'Thành tâm thì ắt linh nghiệm 🌟', 'Ước gì được nấy… nếu chịu khó 😄', 'Ông Chủ gật gù 👍',
];

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function registerShrine(io, world) {
  const DIR = process.env.GALLERY_DIR || path.join(os.tmpdir(), 'hoiquan-gallery');
  mkdirSync(DIR, { recursive: true });
  const FILE = path.join(DIR, 'shrine.json');
  let data = { incense: 0, bows: 0, wishes: [] };
  try { data = { ...data, ...JSON.parse(readFileSync(FILE, 'utf8')) }; } catch { /* lần đầu */ }
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { writeFileSync(FILE, JSON.stringify(data)); } catch {} }, 1000); };
  let sticks = []; // dấu thời gian các nén đang cháy
  const alive = () => (sticks = sticks.filter((ts) => Date.now() - ts < STICK_MS).slice(-12));

  const incenseLimit = rateLimiter(1, 15_000);
  const wishLimit = rateLimiter(1, 20_000);
  const fortuneLimit = rateLimiter(1, 12_000);
  const bowLimit = rateLimiter(2, 4000);
  const sys = (text) => io.emit('chat:message', { system: true, text, ts: Date.now() });
  const state = () => ({ incense: data.incense, bows: data.bows, sticks: alive(), wishes: data.wishes.slice(-20) });

  io.on('connection', (socket) => {
    const me = () => { const p = world.get(socket.id); return p && p.room === 'lobby' ? p : null; };
    socket.on('shrine:sync', () => socket.emit('shrine:state', state()));

    socket.on('shrine:incense', (_, ack) => {
      const p = me();
      if (!p) return;
      if (!incenseLimit(socket.id)) return typeof ack === 'function' && ack({ error: 'Nén trước còn đang cháy, đợi chút rồi thắp tiếp nhé' });
      data.incense++; save();
      sticks.push(Date.now()); alive();
      p.blessUntil = Date.now() + BLESS_MS;
      io.emit('shrine:incense', { id: p.id, name: p.name, total: data.incense, sticks });
      if (typeof ack === 'function') ack({ ok: true, blessUntil: p.blessUntil, total: data.incense });
      if (data.incense % MIRACLE_EVERY === 0) {
        io.emit('shrine:miracle', { name: p.name, total: data.incense });
        sys(`✨ ÔNG CHỦ HIỂN LINH! Nén hương thứ ${data.incense} do ${p.name} thắp – cả Hội Quán được phù hộ!`);
        for (const q of world.players.values()) if (q.room === 'lobby' && !q.bot) q.blessUntil = Date.now() + BLESS_MS;
      } else sys(`🕯️ ${p.name} vừa thắp nén hương cho Ông Chủ (nén thứ ${data.incense})`);
    });

    socket.on('shrine:bow', () => {
      const p = me();
      if (!p || !bowLimit(socket.id)) return;
      data.bows++; save();
      io.emit('shrine:bow', { id: p.id, bows: data.bows });
    });

    socket.on('shrine:fortune', (_, ack) => {
      const p = me();
      if (!p || typeof ack !== 'function') return;
      if (!fortuneLimit(socket.id)) return ack({ error: 'Mỗi lần xin quẻ phải thành tâm, đợi vài giây nhé' });
      const f = pickFortune();
      ack({ fortune: f });
      io.emit('shrine:fortune', { id: p.id, name: p.name, level: f.level, icon: f.icon });
      if (f.level === 'Đại Cát' || f.level === 'Đại Hung') sys(`🎋 ${p.name} xin được quẻ ${f.icon} ${f.level}!`);
    });

    socket.on('shrine:wish', (text, ack) => {
      const p = me();
      const t = clean(text, 80);
      if (!p || !t) return typeof ack === 'function' && ack({ error: 'Viết lời cầu nguyện trước đã nhé' });
      if (!wishLimit(socket.id)) return typeof ack === 'function' && ack({ error: 'Ông Chủ đang nghe lời trước, đợi chút nhé' });
      const w = { name: p.name, text: t, ts: Date.now() };
      data.wishes.push(w); data.wishes = data.wishes.slice(-40); save();
      const reply = REPLIES[randomInt(REPLIES.length)];
      io.emit('shrine:wish', { ...w, id: p.id, reply });
      if (typeof ack === 'function') ack({ ok: true, reply });
    });
  });

  return { isBlessed: (p) => (p?.blessUntil || 0) > Date.now(), state };
}
