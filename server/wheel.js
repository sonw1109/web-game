// 🎡 Vòng quay "Hôm nay ăn gì?": 20 món Việt, server chọn kết quả → mọi người thấy cùng 1 vòng quay.
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { rateLimiter } from './world.js';

export const FOODS = JSON.parse(readFileSync(new URL('./data/foods-vi.json', import.meta.url), 'utf8'));
export const SPIN_MS = 4300;
export const pickFood = () => randomInt(FOODS.length);

export function registerWheel(io, world) {
  let spin = null;          // { index, startAt, by }
  const history = [];       // 6 món gần nhất
  const limit = rateLimiter(3, 3000); // chỉ chống spam; quay xong là bấm quay tiếp được ngay

  const view = () => ({
    foods: FOODS,
    spin: spin && { index: spin.index, by: spin.by, elapsed: Date.now() - spin.startAt, duration: SPIN_MS },
    history,
  });

  io.on('connection', (socket) => {
    socket.on('wheel:sync', () => socket.emit('wheel:state', view()));
    socket.on('wheel:spin', () => {
      const p = world.get(socket.id);
      if (!p || p.room !== 'lobby' || spin || !limit(socket.id)) return; // đang quay → bỏ qua, mỗi lần bấm chỉ 1 lượt
      const index = pickFood();
      spin = { index, startAt: Date.now(), by: p.name };
      io.emit('wheel:spin', { index, by: p.name, elapsed: 0, duration: SPIN_MS });
      setTimeout(() => {
        const f = FOODS[index];
        history.unshift({ ...f, by: p.name, at: Date.now() });
        history.length = Math.min(history.length, 6);
        io.emit('chat:message', { system: true, text: `🎡 ${p.name} quay trúng: ${f.icon} ${f.name} (${f.region}) – đi ăn thôi!`, ts: Date.now() });
        spin = null;
      }, SPIN_MS);
    });
  });
}
