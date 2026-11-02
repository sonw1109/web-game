// 🎲 Bầu Cua Tôm Cá: đặt cược bằng điểm, 3 xúc xắc, nhà cái là server (random an toàn).
import { randomInt } from 'node:crypto';

export const SYMBOLS = ['nai', 'bau', 'ga', 'ca', 'cua', 'tom'];
export const CHIPS = [10, 50, 100, 500];
export const START_BALANCE = 1000;
export const BET_MS = 20_000, ROLL_MS = 3_000, RESULT_MS = 5_500;

/** Tiền thắng/thua của 1 người cho 1 lần lắc. bets = {sym: số điểm}. Trả về số điểm nhận lại (gồm cả tiền cược nếu thắng). */
export function payout(bets, dice) {
  let back = 0;
  for (const [sym, amount] of Object.entries(bets)) {
    const k = dice.filter((d) => d === sym).length;
    if (k > 0) back += amount + amount * k;
  }
  return back;
}

export const rollDice = () => [0, 1, 2].map(() => SYMBOLS[randomInt(SYMBOLS.length)]);

export function registerBauCua(io, world) {
  const ROOM = 'room:baucua';
  const g = {
    phase: 'idle',            // idle | betting | rolling | result
    deadline: 0,
    dice: null,
    bets: new Map(),          // id -> {sym: amount}
    balances: new Map(),      // id -> điểm
    lastDelta: {},            // id -> +/- ván vừa rồi
    history: [],              // 10 lần lắc gần nhất
    round: 0,
  };
  const members = () => world.inRoom('baucua');
  const humans = () => members().filter((p) => !p.bot);
  const bal = (id) => { if (!g.balances.has(id)) g.balances.set(id, START_BALANCE); return g.balances.get(id); };
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });

  const view = () => {
    const totals = Object.fromEntries(SYMBOLS.map((s) => [s, 0]));
    const bets = {};
    for (const [id, b] of g.bets) { bets[id] = b; for (const [s, a] of Object.entries(b)) totals[s] += a; }
    return {
      phase: g.phase, round: g.round,
      remainingMs: Math.max(0, g.deadline - Date.now()),
      totalMs: g.phase === 'betting' ? BET_MS : g.phase === 'rolling' ? ROLL_MS : RESULT_MS,
      dice: g.phase === 'result' ? g.dice : null,
      bets, totals, lastDelta: g.phase === 'result' ? g.lastDelta : {},
      history: g.history,
      players: members().map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, balance: bal(p.id) })).sort((a, b) => b.balance - a.balance),
    };
  };
  const broadcast = () => io.to(ROOM).emit('baucua:state', view());

  function startBetting() {
    if (!humans().length) { g.phase = 'idle'; g.deadline = 0; return broadcast(); }
    g.round++;
    g.phase = 'betting';
    g.dice = null;
    g.bets = new Map();
    g.lastDelta = {};
    g.deadline = Date.now() + BET_MS;
    for (const p of members()) if (bal(p.id) < CHIPS[0]) { g.balances.set(p.id, 500); sys(`💸 ${p.name} hết điểm – nhà cái cứu trợ 500 điểm`); }
    broadcast();
  }

  function roll() {
    if (g.phase !== 'betting') return;
    g.phase = 'rolling';
    g.dice = rollDice();                // quyết định ngay nhưng chỉ công bố khi mở bát
    g.deadline = Date.now() + ROLL_MS;
    broadcast();
  }

  function reveal() {
    g.phase = 'result';
    g.deadline = Date.now() + RESULT_MS;
    for (const [id, b] of g.bets) {
      const staked = Object.values(b).reduce((a, x) => a + x, 0);
      const back = payout(b, g.dice);
      g.balances.set(id, bal(id) + back);
      g.lastDelta[id] = back - staked;
    }
    g.history = [g.dice, ...g.history].slice(0, 10);
    const big = Object.entries(g.lastDelta).sort((a, b) => b[1] - a[1])[0];
    if (big && big[1] > 0) sys(`🎲 ${world.get(big[0])?.name ?? '?'} thắng đậm +${big[1]} điểm!`);
    broadcast();
  }

  function bet(id, sym, amount) {
    if (world.get(id)?.room !== 'baucua' || g.phase !== 'betting' || !SYMBOLS.includes(sym) || !CHIPS.includes(amount)) return false;
    if (bal(id) < amount) return false;
    g.balances.set(id, bal(id) - amount);       // giữ tiền cược ngay
    const b = g.bets.get(id) || {};
    b[sym] = (b[sym] || 0) + amount;
    g.bets.set(id, b);
    broadcast();
    return true;
  }

  function clearBets(id) {
    const b = g.bets.get(id);
    if (g.phase !== 'betting' || !b) return;
    g.balances.set(id, bal(id) + Object.values(b).reduce((a, x) => a + x, 0));
    g.bets.delete(id);
    broadcast();
  }

  io.on('connection', (socket) => {
    const inRoom = () => world.get(socket.id)?.room === 'baucua';
    socket.on('baucua:sync', () => inRoom() && socket.emit('baucua:state', view()));
    socket.on('baucua:start', () => { if (inRoom() && g.phase === 'idle') { sys(`🎲 ${world.get(socket.id).name} mở sòng Bầu Cua!`); startBetting(); } });
    socket.on('baucua:bet', (d) => bet(socket.id, d?.sym, Number(d?.amount)));
    socket.on('baucua:clear', () => clearBets(socket.id));
    socket.on('baucua:roll', () => { if (inRoom() && g.bets.size) roll(); }); // lắc sớm khi đã có người cược
  });

  world.events.on('room', ({ room, prev }) => {
    if (room === 'baucua' || prev === 'baucua') {
      if (prev === 'baucua' && !humans().length) { g.phase = 'idle'; g.deadline = 0; }
      broadcast();
    }
  });

  setInterval(() => {
    if (g.phase === 'idle' || Date.now() < g.deadline) return;
    if (g.phase === 'betting') g.bets.size ? roll() : startBetting(); // không ai cược → chờ ván mới
    else if (g.phase === 'rolling') reveal();
    else if (g.phase === 'result') startBetting();
  }, 250);

  return { g, bet, clearBets, roll };
}
