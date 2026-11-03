// 🌳 Rung cây (rụng quả / chim bay ra) và 🐾 vuốt ve động vật – server bốc kết quả để ai cũng thấy giống nhau.
import { randomInt } from 'node:crypto';
import { rateLimiter } from './world.js';

export const FRUIT_COUNT = 5;          // khớp FRUITS phía client
export const TREE_KINDS = ['tree', 'sakura'];
export const MAX_TREES = 1000;
export const MAX_CRITTERS = 64;

/** Kết quả rung cây. roll ∈ [0, 100). */
export function pickShake(kind, roll = randomInt(100), fruitRoll = randomInt(FRUIT_COUNT)) {
  if (kind === 'sakura') return roll < 22 ? { type: 'bird' } : { type: 'leaves' };
  if (roll < 38) return { type: 'fruit', fruit: fruitRoll };
  if (roll < 58) return { type: 'bird' };
  return { type: 'leaves' };
}

export function registerInteract(io, world) {
  const shakeLimit = rateLimiter(1, 900);
  const petLimit = rateLimiter(2, 1500);
  const treeCooldown = new Map(); // "kind:i" -> lúc rung gần nhất
  const valid = (n, max) => Number.isInteger(n) && n >= 0 && n < max;

  io.on('connection', (socket) => {
    socket.on('tree:shake', (d) => {
      const p = world.get(socket.id);
      if (!p || p.room !== 'lobby' || !TREE_KINDS.includes(d?.kind) || !valid(d?.i, MAX_TREES)) return;
      if (!shakeLimit(socket.id)) return;
      const key = `${d.kind}:${d.i}`, now = Date.now();
      if (now - (treeCooldown.get(key) || 0) < 1200) return; // cây vừa bị rung
      treeCooldown.set(key, now);
      if (treeCooldown.size > 2000) treeCooldown.clear();
      const out = pickShake(d.kind);
      io.emit('tree:shake', { id: p.id, kind: d.kind, i: d.i, out });
      if (out.type === 'fruit') {
        p.basket = (p.basket || 0) + 1;
        socket.emit('tree:got', { fruit: out.fruit, total: p.basket });
      }
    });

    socket.on('critter:pet', (i) => {
      const p = world.get(socket.id);
      if (!p || p.room !== 'lobby' || !valid(i, MAX_CRITTERS) || !petLimit(socket.id)) return;
      io.emit('critter:pet', { id: p.id, i });
    });
  });
}
