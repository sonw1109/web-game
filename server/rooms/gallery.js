// 🖼️ Phòng Tranh: đăng ảnh chung, thả tim, chế độ đèn đồng bộ cả phòng.
// Ảnh lưu ra đĩa (GALLERY_DIR, mặc định thư mục tạm của hệ thống) để restart server không mất.
import express from 'express';
import { rateLimiter } from '../world.js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LIGHTS = ['museum', 'neon', 'disco', 'sunset', 'stars', 'dark'];
export const MAX_PHOTOS = 120;
export const MAX_BYTES = 4 * 1024 * 1024;

/** Nhận diện ảnh qua "magic bytes" (không tin content-type của client). */
export function detectImage(buf) {
  if (buf.length < 128) return null; // quá nhỏ để là ảnh thật
  const tail = buf.subarray(Math.max(0, buf.length - 64));
  const ends = (bytes) => tail.indexOf(Buffer.from(bytes)) >= 0;
  const t = detectHead(buf);
  if (!t) return null;
  // kiểm tra phần kết thúc chuẩn của từng định dạng (chặn file giả mạo chỉ có phần đầu)
  if (t.ext === 'jpg' && !ends([0xff, 0xd9])) return null;
  if (t.ext === 'png' && !ends([0x49, 0x45, 0x4e, 0x44])) return null; // "IEND"
  if (t.ext === 'gif' && buf[buf.length - 1] !== 0x3b) return null;
  if (t.ext === 'webp' && buf.readUInt32LE(4) + 8 > buf.length + 1) return null;
  return t;
}

function detectHead(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return { ext: 'gif', type: 'image/gif' };
  return null;
}

export function registerGallery(app, io, world, password) {
  const DIR = process.env.GALLERY_DIR || path.join(os.tmpdir(), 'hoiquan-gallery');
  mkdirSync(DIR, { recursive: true });
  const INDEX = path.join(DIR, 'index.json');
  const ROOM = 'room:gallery';

  /** @type {{photos: Array<{id,ext,type,caption,by,w,h,ts,likes:string[]}>, light: string}} */
  let state = { photos: [], light: 'museum' };
  try {
    state = { ...state, ...JSON.parse(readFileSync(INDEX, 'utf8')) };
    state.photos = state.photos.filter((p) => existsSync(path.join(DIR, `${p.id}.${p.ext}`)));
  } catch { /* lần chạy đầu */ }
  const save = () => { try { writeFileSync(INDEX, JSON.stringify(state)); } catch (e) { console.warn('[gallery] save', e.message); } };

  const view = () => ({
    light: state.light,
    photos: state.photos.map((p) => ({
      id: p.id, url: `/api/gallery/${p.id}.${p.ext}`, caption: p.caption, by: p.by, w: p.w, h: p.h, ts: p.ts,
      likes: p.likes.length, likedBy: p.likes,
    })),
  });
  const broadcast = () => io.to(ROOM).emit('gallery:state', view());
  const inRoom = (id) => world.get(id)?.room === 'gallery';
  const lastAnnounce = new Map(); // tên → thời điểm báo gần nhất (treo nhiều ảnh 1 lúc chỉ báo 1 lần)

  // ---- Upload qua HTTP (socket.io giới hạn 1MB/tin nhắn) ----
  // Giới hạn theo TỪNG NGƯỜI (không theo IP: trên Render mọi người đi qua cùng 1 proxy → chung 1 IP)
  const uploadLimit = rateLimiter(20, 60_000); // tối đa 20 ảnh / phút mỗi người
  app.post('/api/gallery/upload', express.raw({ type: () => true, limit: MAX_BYTES }), (req, res) => {
    if (req.get('x-password') !== password) return res.status(401).json({ error: 'Sai mật khẩu' });
    const sid = req.get('x-socket-id');
    const p = world.get(sid);
    if (!p) return res.status(403).json({ error: 'Bạn cần đang online trong Hội Quán' });
    if (!uploadLimit(p.name)) return res.status(429).json({ error: 'Treo ảnh nhanh quá, đợi 1 phút nhé' });
    if (state.photos.length >= MAX_PHOTOS) return res.status(400).json({ error: `Phòng đầy (${MAX_PHOTOS} ảnh). Xóa bớt ảnh cũ nhé` });
    const img = Buffer.isBuffer(req.body) ? detectImage(req.body) : null;
    if (!img) return res.status(400).json({ error: 'File không phải ảnh (JPG/PNG/WEBP/GIF)' });
    const id = randomBytes(10).toString('hex');
    writeFileSync(path.join(DIR, `${id}.${img.ext}`), req.body);
    let caption = req.get('x-caption') || '';
    try { caption = decodeURIComponent(caption); } catch { /* mã hóa hỏng → dùng nguyên văn */ }
    caption = caption.trim().slice(0, 120);
    state.photos.unshift({
      id, ext: img.ext, type: img.type, caption, by: p.name, byId: p.id,
      w: Math.max(1, Math.min(10000, +req.get('x-width') || 4)), h: Math.max(1, Math.min(10000, +req.get('x-height') || 3)),
      ts: Date.now(), likes: [],
    });
    save();
    broadcast();
    if (Date.now() - (lastAnnounce.get(p.name) || 0) > 10_000) {
      lastAnnounce.set(p.name, Date.now());
      io.to(ROOM).emit('chat:message', { system: true, text: `🖼️ ${p.name} vừa treo ảnh mới${caption ? `: "${caption}"` : ''}`, ts: Date.now() });
    }
    res.json({ ok: true, id });
  });

  // id ngẫu nhiên 20 ký tự hex → không đoán được, nên phục vụ ảnh không cần mật khẩu (thẻ <img> không gửi header được)
  app.get('/api/gallery/:file', (req, res) => {
    const m = /^([0-9a-f]{20})\.(jpg|png|webp|gif)$/.exec(req.params.file);
    const photo = m && state.photos.find((p) => p.id === m[1] && p.ext === m[2]);
    if (!photo) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(photo.type).sendFile(path.join(DIR, req.params.file));
  });

  io.on('connection', (socket) => {
    socket.on('gallery:sync', () => inRoom(socket.id) && socket.emit('gallery:state', view()));
    socket.on('gallery:light', (light) => {
      if (!inRoom(socket.id) || !LIGHTS.includes(light) || state.light === light) return;
      state.light = light;
      save();
      broadcast();
    });
    socket.on('gallery:like', (id) => {
      const ph = inRoom(socket.id) && state.photos.find((p) => p.id === id);
      if (!ph) return;
      const name = world.get(socket.id).name;
      ph.likes = ph.likes.includes(name) ? ph.likes.filter((n) => n !== name) : [...ph.likes, name];
      save();
      broadcast();
    });
    socket.on('gallery:delete', (id) => {
      if (!inRoom(socket.id)) return;
      const ph = state.photos.find((p) => p.id === id);
      if (!ph) return;
      // chỉ người treo ảnh (cùng tên) hoặc admin mới gỡ được
      const me = world.get(socket.id);
      if (ph.by !== me.name && ph.byId !== socket.id && !me.admin) return socket.emit('chat:message', { system: true, text: '🔒 Chỉ người treo ảnh hoặc admin mới gỡ được ảnh này', ts: Date.now() });
      state.photos = state.photos.filter((p) => p !== ph);
      try { unlinkSync(path.join(DIR, `${ph.id}.${ph.ext}`)); } catch {}
      save();
      broadcast();
      io.to(ROOM).emit('chat:message', { system: true, text: `🗑️ ${world.get(socket.id).name} đã gỡ một bức ảnh`, ts: Date.now() });
    });
  });
}
