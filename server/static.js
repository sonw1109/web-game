// Phục vụ web đã build cho nhanh:
// - file trong /assets có mã băm trong tên → cho trình duyệt giữ 1 năm (vào lại không phải tải lại)
// - dùng sẵn bản nén .br / .gz tạo lúc build (scripts/precompress.mjs) → tải nhẹ hơn ~4 lần, không tốn CPU nén mỗi lần
// - index.html luôn hỏi lại server (để bản mới được dùng ngay sau khi deploy)
import express from 'express';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';

/** Liệt kê mọi file (đường dẫn dạng /a/b.js) trong thư mục build. */
function listFiles(dir, base = '') {
  const out = [];
  let names = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const full = path.join(dir, n), rel = `${base}/${n}`;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

const LONG = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

export function serveStatic(app, dist) {
  const files = new Set(listFiles(dist));
  const cacheFor = (rel) => (rel.startsWith('/assets/') ? LONG : NO_CACHE);

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const rel = req.path === '/' ? '/index.html' : req.path;
    if (!files.has(rel)) return next();
    const ae = String(req.headers['accept-encoding'] || '');
    res.setHeader('Vary', 'Accept-Encoding');
    for (const [enc, ext] of [['br', '.br'], ['gzip', '.gz']]) {
      if (!ae.includes(enc) || !files.has(rel + ext)) continue;
      res.setHeader('Content-Encoding', enc);
      res.setHeader('Cache-Control', cacheFor(rel));
      res.type(path.extname(rel)); // đặt trước để sendFile không đoán theo đuôi .br/.gz
      return res.sendFile(rel.slice(1) + ext, { root: dist, dotfiles: 'deny', cacheControl: false });
    }
    next();
  });
  app.use(express.static(dist, {
    index: 'index.html',
    setHeaders: (res, file) => res.setHeader('Cache-Control', cacheFor(`/${path.relative(dist, file).split(path.sep).join('/')}`)),
  }));
  // đường dẫn lạ (vd. /room/abc) → trả trang chính
  app.get('/{*splat}', (_req, res) => {
    res.setHeader('Cache-Control', NO_CACHE);
    res.sendFile(path.join(dist, 'index.html'));
  });
}
