// Test tích hợp: chạy server thật (cổng ngẫu nhiên, thư mục dữ liệu tạm) + nhiều client socket.io.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as ioc } from 'socket.io-client';

const PORT = 4300 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORT}`;
const DATA = mkdtempSync(path.join(os.tmpdir(), 'hq-test-'));
let server, stderr = '';
const clients = [];

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), GALLERY_DIR: DATA, APP_PASSWORD: 'pw', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', (d) => { stderr += d; });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server không khởi động')), 10000);
    server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); res(); } });
  });
});
after(() => { for (const c of clients) c.close(); server?.kill(); rmSync(DATA, { recursive: true, force: true }); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Kết nối + vào sảnh, trả về { s, id }. */
async function join(name, password = 'pw') {
  const s = ioc(URL, { auth: { password }, transports: ['websocket'], reconnection: false, forceNew: true });
  clients.push(s);
  await new Promise((res, rej) => { s.once('connect', res); s.once('connect_error', rej); });
  const { selfId } = await new Promise((r) => s.emit('world:join', { name, appearance: {}, x: 384, y: 384 }, r));
  return { s, id: selfId };
}
const ask = (s, ev, ...args) => new Promise((r) => s.emit(ev, ...args, r));
/** Chờ sự kiện thỏa điều kiện (hoặc hết giờ → null). */
const next = (s, ev, pred = () => true, ms = 1500) => new Promise((r) => {
  const t = setTimeout(() => { s.off(ev, h); r(null); }, ms);
  const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); r(d); } };
  s.on(ev, h);
});

test('sai mật khẩu → bị từ chối', async () => {
  await assert.rejects(join('Lạ', 'sai'));
});

test('ghế: 1 chỗ 1 người, đi tiếp thì đứng dậy, người khác ngồi được', async () => {
  const A = await join('An'), B = await join('Bình');
  assert.deepEqual(await ask(A.s, 'seat:sit', 3), { ok: true });
  assert.match((await ask(B.s, 'seat:sit', 3)).error, /có người/);
  const stood = next(B.s, 'world:seat', (d) => d.id === A.id && d.seat === null);
  A.s.emit('world:move', { x: 400, y: 400, rot: 0, moving: true });
  assert.ok(await stood, 'không báo An đứng dậy');
  assert.deepEqual(await ask(B.s, 'seat:sit', 3), { ok: true });
});

test('ghế: vào phòng hoặc rớt mạng thì ghế được giải phóng', async () => {
  const A = await join('Cường'), B = await join('Dung');
  await ask(A.s, 'seat:sit', 7);
  const freed = next(B.s, 'world:seat', (d) => d.id === A.id && d.seat === null);
  A.s.emit('world:setRoom', 'cinema');
  assert.ok(await freed, 'vào phòng mà vẫn giữ ghế');
  assert.deepEqual(await ask(B.s, 'seat:sit', 7), { ok: true });
  // B rớt mạng khi đang ngồi → A (đã về sảnh) ngồi được
  A.s.emit('world:setRoom', 'lobby');
  B.s.disconnect();
  await wait(150);
  assert.deepEqual(await ask(A.s, 'seat:sit', 7), { ok: true });
  // trong phòng thì không ngồi ghế sảnh được
  A.s.emit('world:setRoom', 'caro'); await wait(50);
  assert.ok((await ask(A.s, 'seat:sit', 8)).error);
});

test('ghế: dữ liệu rác bị từ chối, không sập', async () => {
  const A = await join('Rác');
  for (const bad of ['3', -1, 64, 1e9, 1.5, null, {}, [], NaN]) assert.ok((await ask(A.s, 'seat:sit', bad)).error, `nhận ${JSON.stringify(bad)}`);
});

test('hành động: chỉ phát loại hợp lệ, có quỳ lạy', async () => {
  const A = await join('Em'), B = await join('Phương');
  const got = next(B.s, 'emote:show', (d) => d.id === A.id);
  A.s.emit('emote:send', 'hack<script>');
  A.s.emit('emote:send', 'kowtow');
  assert.equal((await got).type, 'kowtow');
});

test('tượng đài: thắp hương giới hạn tốc độ, xin quẻ, cầu nguyện lưu đúng chữ', async () => {
  const A = await join('Giang'), B = await join('Hà');
  const r1 = await ask(A.s, 'shrine:incense', null);
  assert.ok(r1.ok && r1.blessUntil > Date.now());
  assert.match((await ask(A.s, 'shrine:incense', null)).error, /đợi/);
  const f = await ask(A.s, 'shrine:fortune', null);
  assert.ok(f.fortune?.level && f.fortune?.text);
  assert.ok((await ask(A.s, 'shrine:wish', '   ')).error, 'nhận điều ước rỗng');
  const heard = next(B.s, 'shrine:wish', (w) => w.id === A.id);
  const w = await ask(A.s, 'shrine:wish', `<b>giàu</b>\n${'x'.repeat(200)}`);
  assert.ok(w.ok);
  const msg = await heard;
  assert.ok(msg.text.startsWith('<b>giàu</b> x') && msg.text.length === 80, 'phải giữ nguyên chữ (client tự escape), bỏ xuống dòng, cắt 80 ký tự');
  const st = await new Promise((r) => { B.s.once('shrine:state', r); B.s.emit('shrine:sync'); });
  assert.ok(st.incense >= 1 && st.wishes.some((x) => x.name === 'Giang'));
});

test('rung cây: hợp lệ thì cả sảnh thấy, cùng cây bị chặn spam', async () => {
  const A = await join('Khoa'), B = await join('Lan');
  const seen = [];
  B.s.on('tree:shake', (d) => seen.push(d));
  A.s.emit('tree:shake', { kind: 'tree', i: 5 });
  await wait(150);
  A.s.emit('tree:shake', { kind: 'tree', i: 5 });
  B.s.emit('tree:shake', { kind: 'tree', i: 5 }); // người khác rung ngay cây đó → cây đang "hồi"
  for (const bad of [null, 'x', { kind: 'cay', i: 1 }, { kind: 'tree', i: -1 }, { kind: 'tree', i: 5000 }]) A.s.emit('tree:shake', bad);
  await wait(300);
  assert.equal(seen.length, 1);
  assert.ok(['fruit', 'bird', 'leaves'].includes(seen[0].out.type));
});

test('dữ liệu rác vào MỌI sự kiện không làm sập server', async () => {
  const A = await join('Phá');
  const events = ['world:join', 'world:move', 'world:setRoom', 'chat:send', 'emoji:send', 'emote:send', 'fx:fireworks', 'seat:sit', 'seat:stand',
    'admin:login', 'admin:logout', 'rtc:signal', 'rtc:media', 'tree:shake', 'critter:pet', 'shrine:incense', 'shrine:bow', 'shrine:fortune', 'shrine:wish', 'shrine:sync',
    'fish:cast', 'fish:reel', 'fish:stop', 'fish:book', 'weather:sync', 'wheel:spin', 'wheel:sync', 'bot:add', 'bot:remove',
    'cinema:add', 'cinema:play', 'cinema:pause', 'cinema:seek', 'cinema:next', 'cinema:sync', 'caro:sit', 'caro:move', 'caro:reset', 'caro:leave',
    'draw:start', 'draw:stroke', 'draw:clear', 'draw:guess', 'quiz:start', 'quiz:answer', 'typing:start', 'typing:progress', 'typing:join',
    'baucua:bet', 'baucua:roll', 'baucua:clear', 'baucua:grant', 'baucua:grantAll', 'gallery:list', 'gallery:delete'];
  const junk = [undefined, null, 0, -1, 1e308, NaN, '', 'x'.repeat(5000), [], [1, 2], {}, { x: 'a', y: {}, id: [] }, { __proto__: { a: 1 } }, true];
  for (const room of ['lobby', 'cinema', 'caro', 'draw', 'quiz', 'typing', 'baucua', 'gallery']) {
    A.s.emit('world:setRoom', room);
    for (const ev of events) for (const j of junk) { A.s.emit(ev, j); A.s.emit(ev, j, j); A.s.emit(ev, j, () => {}); }
    await wait(60);
  }
  await wait(400);
  assert.ok(!/lỗi không bắt được|promise lỗi/.test(stderr), `server ném lỗi:\n${stderr.slice(0, 1500)}`);
  const C = await join('Còn sống?');
  assert.ok(C.id, 'server không còn phản hồi');
});

// ---------- các lỗi đã sửa (giữ test để không tái phát) ----------
test('gửi world:join lần 2 không tạo "người ma", giữ nguyên phòng đang ở', async () => {
  const A = await join('Mạnh');
  A.s.emit('world:setRoom', 'caro'); await wait(80);
  const again = await new Promise((r) => A.s.emit('world:join', { name: 'Mạnh 2' }, r));
  const me = again.players.filter((p) => p.id === A.id);
  assert.equal(me.length, 1);
  assert.equal(me[0].room, 'caro');
  assert.equal(me[0].name, 'Mạnh');
});

test('Bầu Cua: tải lại trang không reset điểm; người cuối rời bàn thì được hoàn tiền cược', async () => {
  const state = (s) => new Promise((r) => { s.once('baucua:state', r); s.emit('baucua:sync'); });
  const A = await join('Ngọc');
  A.s.emit('world:setRoom', 'baucua'); await wait(80);
  A.s.emit('baucua:start'); await wait(80);
  A.s.emit('baucua:bet', { sym: 'nai', amount: 100 }); await wait(80);
  const mine = (st) => st.players.find((p) => p.name === 'Ngọc').balance;
  const before = mine(await state(A.s));
  A.s.emit('world:setRoom', 'lobby'); await wait(120);   // rời bàn khi đang cược → hoàn 100
  A.s.disconnect(); await wait(80);
  const A2 = await join('Ngọc');                          // "tải lại trang"
  A2.s.emit('world:setRoom', 'baucua'); await wait(120);
  assert.equal(mine(await state(A2.s)), before + 100);
});

test('Câu cá: tên đặc biệt như "constructor" không làm hỏng sổ cá', async () => {
  const A = await join('constructor');
  const book = await new Promise((r) => { A.s.once('fish:book', r); A.s.emit('fish:book'); });
  assert.deepEqual({ points: book.mine.points, total: book.mine.total }, { points: 0, total: 0 });
});

test('Phòng Tranh: chỉ người treo ảnh (hoặc admin) mới gỡ được', async () => {
  // PNG 1×1 thật + chèn khối tEXt cho đủ kích thước tối thiểu (server chặn file < 128 byte)
  const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const text = Buffer.from('Comment\0' + 'Hoi Quan test '.repeat(8));
  const chunk = Buffer.concat([Buffer.from([0, 0, 0, text.length]), Buffer.from('tEXt'), text, Buffer.alloc(4)]);
  const PNG = Buffer.concat([tiny.subarray(0, 33), chunk, tiny.subarray(33)]);
  const A = await join('Oanh'), B = await join('Phúc');
  for (const c of [A, B]) c.s.emit('world:setRoom', 'gallery');
  await wait(80);
  const up = await fetch(`${URL}/api/gallery/upload`, { method: 'POST', body: PNG, headers: { 'x-password': 'pw', 'x-socket-id': A.id, 'content-type': 'application/octet-stream' } });
  const { id } = await up.json();
  assert.ok(id, 'upload thất bại');
  const list = async () => (await new Promise((r) => { A.s.once('gallery:state', r); A.s.emit('gallery:sync'); })).photos.map((p) => p.id);
  B.s.emit('gallery:delete', id); await wait(120);
  assert.ok((await list()).includes(id), 'người khác gỡ được ảnh');
  A.s.emit('gallery:delete', id); await wait(120);
  assert.ok(!(await list()).includes(id), 'chủ ảnh không gỡ được');
});
