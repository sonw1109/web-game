// Phục vụ web đã build: dùng bản nén sẵn, cache đúng, không lộ file ngoài thư mục build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { serveStatic } from '../server/static.js';
import { createBoard } from '../server/arcade.js';

const dist = mkdtempSync(path.join(os.tmpdir(), 'hq-static-'));
mkdirSync(path.join(dist, 'assets'));
const JS = 'console.log("xin chào");'.repeat(100);
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Hội Quán</title>');
writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), JS);
writeFileSync(path.join(dist, 'assets', 'app-abc123.js.br'), brotliCompressSync(JS));
writeFileSync(path.join(dist, 'assets', 'app-abc123.js.gz'), gzipSync(JS));
writeFileSync(path.join(os.tmpdir(), 'hq-secret.txt'), 'bí mật');

const app = express();
serveStatic(app, dist);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('file /assets: gửi bản brotli, đúng Content-Type, cache 1 năm', async () => {
  const res = await fetch(`${base}/assets/app-abc123.js`, { headers: { 'accept-encoding': 'br' } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(res.headers.get('cache-control'), /immutable/);
  assert.equal(res.headers.get('content-encoding'), 'br');
  // fetch của Node tự giải nén → nội dung phải đúng bản gốc
  assert.equal(await res.text(), JS);
});

test('trình duyệt không nhận nén → gửi bản thường', async () => {
  const res = await fetch(`${base}/assets/app-abc123.js`, { headers: { 'accept-encoding': 'identity' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), null);
  assert.equal(await res.text(), JS);
});

test('index.html luôn hỏi lại server; đường dẫn lạ trả về trang chính', async () => {
  const a = await fetch(`${base}/`);
  assert.equal(a.headers.get('cache-control'), 'no-cache');
  const b = await fetch(`${base}/phong/abc`);
  assert.equal(b.status, 200);
  assert.match(await b.text(), /Hội Quán/);
});

test('không đọc được file ngoài thư mục build', async () => {
  for (const p of ['/../hq-secret.txt', '/%2e%2e/hq-secret.txt', '/assets/..%2f..%2fhq-secret.txt', '/assets/app-abc123.js.br/../../../hq-secret.txt']) {
    const res = await fetch(base + p);
    assert.doesNotMatch(await res.text(), /bí mật/, p);
  }
});

test('Bảng Vàng: cộng điểm, kỷ lục, chặn dữ liệu rác', () => {
  const b = createBoard({ chess: { An: { pts: 50, wins: 1 }, '<x>': 'rác', constructor: { pts: 'NaN' } }, khongco: { A: 1 } });
  assert.ok(b.award('chess', 'Bình', 30, { win: true }));
  assert.ok(b.award('g2048', 'An', 0, { best: 4096 }));
  assert.ok(b.award('g2048', 'An', 0, { best: 1000 }));
  assert.equal(b.top('g2048')[0].best, 4096);
  assert.ok(!b.award('khongco', 'An', 10));
  assert.ok(!b.award('chess', '', 10));
  assert.ok(!b.award('chess', { name: 'x' }, 10));
  assert.ok(b.award('chess', '__proto__', 5));            // tên lạ không phá object
  assert.equal(Object.getPrototypeOf(b.games.chess), null);
  const top = b.top('chess');
  assert.deepEqual(top.slice(0, 2).map((r) => r.name), ['An', 'Bình']);
  assert.equal(b.top('all')[0].name, 'An');
  b.award('chess', 'Bình', Infinity);
  assert.ok(Number.isFinite(b.games.chess['Bình'].pts));
});
