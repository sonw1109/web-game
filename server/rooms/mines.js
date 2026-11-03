// 💣 Dò Mìn Đồng Đội – cả phòng chung 1 bảng. Mìn chỉ sinh sau cú mở đầu tiên (ô đầu + lân cận an toàn).
// Server giữ vị trí mìn; client chỉ thấy ô đã mở (số) và cờ.
import { reply, rateLimiter } from '../world.js';

export const SIZES = { s: { w: 9, h: 9, mines: 10, label: '9×9 · 10 mìn' }, l: { w: 16, h: 16, mines: 40, label: '16×16 · 40 mìn' } };
export const WIN_BONUS = 50, TOP_BONUS = 10;
export const IDLE_NEW_MS = 20_000;   // đang chơi: 20 giây không ai thao tác mới được bỏ ván
// Mã ô trong view: -1 chưa mở, -2 cờ, 0..8 số, 9 mìn (lộ khi thua), 10 mìn nổ, 11 cờ cắm sai
export const HIDDEN = -1, FLAG = -2, MINE = 9, BOOM = 10, WRONG_FLAG = 11;

const neighbors = (i, w, h) => {
  const x = i % w, y = Math.floor(i / w), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
};

/** Phần lõi (không socket) để test. */
export function createMines({ now = Date.now, rand = Math.random } = {}) {
  const s = {
    round: 0, size: 'l', w: 16, h: 16, mines: 40,
    status: 'ready',                 // ready (chưa có mìn) | playing | won | lost
    mine: null,                      // Uint8Array – CHỈ ở server
    num: null,                       // số mìn lân cận
    open: null, flag: null,          // Uint8Array
    opened: 0,
    boom: -1,
    players: new Map(),              // id → { name, opened }
    startedAt: 0, endedAt: 0, lastActAt: 0,
  };
  const reset = (size) => {
    const c = SIZES[size] ? size : s.size;
    Object.assign(s, { size: c, ...SIZES[c] });
    delete s.label;
    const n = s.w * s.h;
    s.round++; s.status = 'ready';
    s.mine = new Uint8Array(n); s.num = new Uint8Array(n); s.open = new Uint8Array(n); s.flag = new Uint8Array(n);
    s.opened = 0; s.boom = -1; s.players = new Map();
    s.startedAt = 0; s.endedAt = 0; s.lastActAt = now();
  };
  reset('l');

  const placeMines = (first) => {
    const safe = new Set([first, ...neighbors(first, s.w, s.h)]);
    const pool = [];
    for (let i = 0; i < s.w * s.h; i++) if (!safe.has(i)) pool.push(i);
    for (let k = 0; k < s.mines && pool.length; k++) {
      const j = k + Math.floor(rand() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      s.mine[pool[k]] = 1;
    }
    for (let i = 0; i < s.w * s.h; i++) s.num[i] = neighbors(i, s.w, s.h).reduce((a, j) => a + s.mine[j], 0);
    s.status = 'playing'; s.startedAt = now();
  };
  const player = (id, name) => {
    let p = s.players.get(id);
    if (!p) { p = { name: String(name ?? '?'), opened: 0 }; s.players.set(id, p); }
    return p;
  };
  const safeTotal = () => s.w * s.h - s.mines;

  /** Mở 1 ô (loang BFS nếu là 0). Trả số ô mới mở, hoặc -1 nếu dẫm mìn. */
  const reveal = (start) => {
    if (s.open[start] || s.flag[start]) return 0;
    if (s.mine[start]) { s.boom = start; return -1; }
    let count = 0;
    const queue = [start];
    s.open[start] = 1;
    while (queue.length) {
      const i = queue.shift();
      count++;
      if (s.num[i]) continue;
      for (const j of neighbors(i, s.w, s.h)) {
        if (s.open[j] || s.flag[j] || s.mine[j]) continue;
        s.open[j] = 1; queue.push(j);
      }
    }
    return count;
  };
  const end = (won) => { s.status = won ? 'won' : 'lost'; s.endedAt = now(); };
  const validIdx = (i) => Number.isInteger(i) && i >= 0 && i < s.w * s.h;

  return {
    s,
    /** Mở ô (hoặc chord nếu ô đã mở là số đủ cờ). → { ok, opened, ended } */
    open(id, name, i) {
      if ((s.status !== 'ready' && s.status !== 'playing') || !validIdx(i)) return { ok: false };
      if (s.flag[i]) return { ok: false };
      if (s.status === 'ready') placeMines(i);
      let targets;
      if (s.open[i]) {
        // chord: số đã đủ cờ xung quanh → mở hết các ô chưa cắm cờ quanh nó
        const nb = neighbors(i, s.w, s.h);
        if (!s.num[i] || nb.filter((j) => s.flag[j]).length !== s.num[i]) return { ok: false };
        targets = nb.filter((j) => !s.open[j] && !s.flag[j]);
        if (!targets.length) return { ok: false };
      } else targets = [i];
      const p = player(id, name);
      s.lastActAt = now();
      let opened = 0, dead = false;
      for (const t of targets) {
        const r = reveal(t);
        if (r < 0) { dead = true; break; }
        opened += r;
      }
      p.opened += opened; s.opened += opened;
      if (dead) { end(false); return { ok: true, opened, ended: 'lost' }; }
      if (s.opened >= safeTotal()) {
        end(true);
        for (let k = 0; k < s.w * s.h; k++) if (s.mine[k]) s.flag[k] = 1; // cắm cờ hết cho đẹp
        return { ok: true, opened, ended: 'won' };
      }
      return { ok: true, opened, ended: null };
    },
    flag(id, name, i) {
      if (s.status !== 'playing' || !validIdx(i) || s.open[i]) return false;
      s.flag[i] ^= 1;
      player(id, name);
      s.lastActAt = now();
      return true;
    },
    canNew() { return s.status !== 'playing' || now() - s.lastActAt >= IDLE_NEW_MS; },
    newGame(size) {
      if (!this.canNew()) return false;
      reset(typeof size === 'string' && SIZES[size] ? size : s.size);
      return true;
    },
    /** Kết quả chia điểm khi ván kết thúc: [{ id, pts, win, top }] */
    payout() {
      const won = s.status === 'won';
      const list = [...s.players];
      if (!list.length || (s.status !== 'won' && s.status !== 'lost')) return [];
      const share = won ? Math.floor(WIN_BONUS / list.length) : 0;
      const maxOpen = Math.max(...list.map(([, p]) => p.opened));
      return list.map(([id, p]) => {
        const top = won && p.opened === maxOpen && maxOpen > 0;
        return { id, name: p.name, opened: p.opened, pts: p.opened + share + (top ? TOP_BONUS : 0), win: won, top };
      });
    },
    reset,
    /** Chỉ ô đã mở / cờ; vị trí mìn chỉ lộ khi THUA. */
    view() {
      const over = s.status === 'won' || s.status === 'lost';
      const cells = new Array(s.w * s.h);
      for (let i = 0; i < cells.length; i++) {
        if (s.open[i]) cells[i] = s.num[i];
        else if (s.status === 'lost' && i === s.boom) cells[i] = BOOM;
        else if (s.status === 'lost' && s.mine[i] && !s.flag[i]) cells[i] = MINE;
        else if (s.status === 'lost' && s.flag[i] && !s.mine[i]) cells[i] = WRONG_FLAG;
        else cells[i] = s.flag[i] ? FLAG : HIDDEN;
      }
      let flags = 0; for (let i = 0; i < s.flag.length; i++) flags += s.flag[i];
      return {
        round: s.round, size: s.size, w: s.w, h: s.h, mines: s.mines, status: s.status,
        cells, minesLeft: s.mines - flags,
        players: [...s.players].map(([id, p]) => ({ id, name: p.name, opened: p.opened })).sort((a, b) => b.opened - a.opened),
        elapsedMs: s.startedAt ? (over ? s.endedAt : now()) - s.startedAt : 0,
        newInMs: this.canNew() ? 0 : Math.max(0, IDLE_NEW_MS - (now() - s.lastActAt)),
      };
    },
  };
}

export function register(io, world, arcade) {
  const game = createMines();
  const ROOM = 'room:mines';
  const actLimit = rateLimiter(12, 1000);
  const newLimit = rateLimiter(3, 10_000);
  const syncLimit = rateLimiter(10, 5000);
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });
  const broadcast = () => io.to(ROOM).emit('mines:state', game.view());

  const settle = (result, by) => {
    const list = game.payout();
    for (const r of list) arcade?.award('mines', r.id, r.pts, { win: r.win });
    if (result === 'lost') sys(`💣 BÙM! ${by ?? 'Ai đó'} dẫm mìn – cả đội thua!`);
    else {
      const top = list.filter((r) => r.top).map((r) => r.name);
      sys(`💣 Dò Mìn: cả đội gỡ sạch bãi mìn! 🎉 +${Math.floor(WIN_BONUS / Math.max(1, list.length))} điểm mỗi người${top.length ? ` · 🏆 mở nhiều nhất: ${top.join(', ')}` : ''}.`);
    }
  };

  io.on('connection', (socket) => {
    socket.on('mines:sync', () => { if (world.get(socket.id)?.room === 'mines' && syncLimit(socket.id)) socket.emit('mines:state', game.view()); });
    socket.on('mines:open', (i) => {
      const p = world.get(socket.id);
      if (p?.room !== 'mines' || !actLimit(socket.id)) return;
      const r = game.open(socket.id, p.name, i);
      if (!r.ok) return;
      broadcast();
      if (r.ended) settle(r.ended, p.name);
    });
    socket.on('mines:flag', (i) => {
      const p = world.get(socket.id);
      if (p?.room !== 'mines' || !actLimit(socket.id)) return;
      if (game.flag(socket.id, p.name, i)) broadcast();
    });
    socket.on('mines:new', (size, ack) => {
      const p = world.get(socket.id);
      if (p?.room !== 'mines') return reply(ack, { ok: false });
      if (!newLimit(socket.id)) return reply(ack, { ok: false, error: 'Chậm lại chút' });
      if (!game.newGame(size)) return reply(ack, { ok: false, error: 'Đội đang dò – chờ 20 giây không ai thao tác' });
      reply(ack, { ok: true });
      broadcast();
    });
  });

  // Phòng trống thì dọn ván (ván dở không ai chơi tiếp)
  world.events.on('room', ({ prev }) => {
    if (prev !== 'mines' || world.inRoom('mines').length) return;
    if (game.s.status === 'playing' || game.s.status === 'ready') game.reset(game.s.size);
  });

  return { game };
}
