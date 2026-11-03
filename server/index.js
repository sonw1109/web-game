import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWorld } from './world.js';
import { registerCinema } from './rooms/cinema.js';
import { registerCaro } from './rooms/caro.js';
import { registerDrawGuess } from './rooms/drawGuess.js';
import { registerQuiz } from './rooms/quiz.js';
import { registerBots } from './bots/index.js';
import { registerGallery } from './rooms/gallery.js';
import { registerBauCua } from './rooms/baucua.js';
import { registerTyping } from './rooms/typing.js';
import { registerFeatures } from './features.js';
import { registerInteract } from './interact.js';
import { registerShrine } from './shrine.js';
import { registerWheel } from './wheel.js';
import { registerArcade } from './arcade.js';
import { serveStatic } from './static.js';
import * as chess from './rooms/chess.js';
import * as sudoku from './rooms/sudoku.js';
import * as mines from './rooms/mines.js';
import * as riddle from './rooms/riddle.js';
import * as memory from './rooms/memory.js';
import * as rps from './rooms/rps.js';
import * as g2048 from './rooms/g2048.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || 'hoiquan';
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProd ? undefined : { origin: true },
  maxHttpBufferSize: 1e6,
});
io.setMaxListeners(60); // mỗi tính năng đăng ký 1 listener 'connection' riêng

app.get('/healthz', (_req, res) => res.send('ok'));

// Cấu hình STUN/TURN cho WebRTC. TURN giúp kết nối khi 2 người ở sau NAT khó (4G, mạng công ty).
// Đặt TURN_URLS (cách nhau dấu phẩy), TURN_USERNAME, TURN_CREDENTIAL – vd. tài khoản free của metered.ca
app.get('/api/ice', (_req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) {
    iceServers.push({
      urls: process.env.TURN_URLS.split(',').map((s) => s.trim()),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ iceServers });
});


// Khóa cả web bằng 1 mật khẩu chung
io.use((socket, next) => {
  if (socket.handshake.auth?.password === PASSWORD) return next();
  next(new Error('WRONG_PASSWORD'));
});

// Lưới an toàn: 1 handler lỗi (dữ liệu lạ từ client) chỉ ghi log, không làm sập server của cả nhóm
process.on('uncaughtException', (e) => console.error('[lỗi không bắt được]', e));
process.on('unhandledRejection', (e) => console.error('[promise lỗi]', e));

const world = registerWorld(io);
registerCinema(io, world);
const caro = registerCaro(io, world);
const draw = registerDrawGuess(io, world);
const quiz = registerQuiz(io, world);
const typing = registerTyping(io, world);
const baucua = registerBauCua(io, world);
// 🕹️ Khu Trò Chơi: mỗi game tự đăng ký sự kiện + bot của mình, điểm dồn về Bảng Vàng chung
const arcade = registerArcade(io, world);
const arcadeBots = {};
for (const [id, mod] of Object.entries({ chess, sudoku, mines, riddle, memory, rps, g2048 })) {
  const r = mod.register(io, world, arcade);
  if (r?.bot) arcadeBots[id] = r.bot;
}
registerBots(world, { caro, draw, quiz, typing, baucua }, arcadeBots);
registerGallery(app, io, world, PASSWORD);
// hồ câu: phải khớp LAKE trong client/src/game/map.js
registerFeatures(io, world, { lake: { x: 44, y: 20, w: 14, h: 9 } });
registerWheel(io, world);
registerInteract(io, world);
registerShrine(io, world);

// Lỗi từ middleware (vd. file quá lớn) → trả JSON để client hiện thông báo dễ hiểu
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Ảnh quá lớn (tối đa 4MB)' });
  console.error('[http]', err.message);
  res.status(err.status || 500).json({ error: 'Lỗi server' });
});

// Phục vụ web đã build – đặt SAU các route /api để không nuốt mất chúng
if (isProd) serveStatic(app, path.join(__dirname, '..', 'client', 'dist'));

httpServer.listen(PORT, () => {
  console.log(`🏮 Hội Quán server chạy tại http://localhost:${PORT}`);
  if (!process.env.APP_PASSWORD) console.log(`   (mật khẩu mặc định: "${PASSWORD}" – đặt APP_PASSWORD để đổi)`);
});
