// 🎲 Sòng Bầu Cua – UI: chọn phỉnh, chạm ô (trên bàn 3D hoặc bảng dưới) để đặt cược.
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from '../ui/sound.js';

export const SYMBOLS = [
  { id: 'nai', name: 'Nai', icon: '🦌' }, { id: 'bau', name: 'Bầu', icon: '🍐' }, { id: 'ga', name: 'Gà', icon: '🐓' },
  { id: 'ca', name: 'Cá', icon: '🐟' }, { id: 'cua', name: 'Cua', icon: '🦀' }, { id: 'tom', name: 'Tôm', icon: '🦐' },
];
const CHIPS = [10, 50, 100, 500];
const ICON = Object.fromEntries(SYMBOLS.map((s) => [s.id, s.icon]));

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main baucua-main">
    <div class="bc-status" data-el="status"></div>
    <div class="timer-bar"><div data-el="timer"></div></div>
    <div class="bc-panel" data-el="panel">
      <div class="bc-grid" data-el="grid"></div>
      <div class="bc-bar">
        <div class="bc-chips" data-el="chips"></div>
        <button class="btn btn-ghost btn-sm" data-el="clear">↩ Xóa cược</button>
        <button class="btn btn-primary btn-sm" data-el="roll">🎲 Lắc!</button>
      </div>
    </div>
    <button class="btn btn-primary btn-big" data-el="start" hidden>🎲 Mở sòng</button>
  </div>
  <aside class="game-side">
    <h3>Điểm của mọi người</h3>
    <ol class="scoreboard" data-el="board"></ol>
    <h3>Các lần lắc gần đây</h3>
    <div class="bc-history" data-el="history"></div>
    <p class="muted small">Chọn phỉnh rồi chạm vào ô con vật (trên bàn hoặc bảng dưới). Trúng 1 con ăn 1, trúng 2 ăn 2, trúng 3 ăn 3. Chơi bằng điểm cho vui, không dùng tiền thật nhé!</p>
  </aside>
</div>`;

export function createBauCuaRoom() {
  const root = document.getElementById('room-baucua');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null, chip = 50;
  const node = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };

  const bet = (sym) => {
    if (state?.phase !== 'betting') return;
    socket.emit('baucua:bet', { sym, amount: chip });
    sound.play('pop');
  };

  // bảng 6 ô + phỉnh
  for (const s of SYMBOLS) {
    const b = node('button', 'bc-cell');
    b.dataset.sym = s.id;
    b.append(node('span', 'ic', s.icon), node('span', 'nm', s.name), node('span', 'mine'), node('span', 'total'));
    b.onclick = () => bet(s.id);
    el('grid').append(b);
  }
  for (const c of CHIPS) {
    const b = node('button', `bc-chip bc-chip-${c}`, String(c));
    b.onclick = () => { chip = c; paintChips(); };
    el('chips').append(b);
  }
  const paintChips = () => [...el('chips').children].forEach((b) => b.classList.toggle('active', +b.textContent === chip));
  paintChips();
  el('clear').onclick = () => socket.emit('baucua:clear');
  el('roll').onclick = () => socket.emit('baucua:roll');
  el('start').onclick = () => socket.emit('baucua:start');

  function render() {
    const s = state;
    const mine = s.bets[store.selfId] || {};
    const myBal = s.players.find((p) => p.id === store.selfId)?.balance ?? 0;
    const myDelta = s.lastDelta[store.selfId];
    let msg;
    if (s.phase === 'idle') msg = '🎲 Sòng đang đóng – bấm "Mở sòng" để chơi';
    else if (s.phase === 'betting') msg = `💰 Đặt cược đi! · Bạn còn ${myBal} điểm`;
    else if (s.phase === 'rolling') msg = '🥣 Đang lắc bát…';
    else msg = `${s.dice.map((d) => ICON[d]).join(' ')}  ${myDelta === undefined ? '' : myDelta >= 0 ? `🎉 +${myDelta}` : `😢 ${myDelta}`}`;
    el('status').textContent = msg;
    el('start').hidden = s.phase !== 'idle';
    el('panel').hidden = s.phase === 'idle';
    for (const b of el('grid').children) {
      const sym = b.dataset.sym;
      b.querySelector('.mine').textContent = mine[sym] ? `Bạn: ${mine[sym]}` : '';
      b.querySelector('.total').textContent = s.totals[sym] ? `Tổng ${s.totals[sym]}` : '';
      b.disabled = s.phase !== 'betting';
      b.classList.toggle('win', s.phase === 'result' && s.dice.includes(sym));
    }
    el('clear').disabled = s.phase !== 'betting' || !Object.keys(mine).length;
    el('roll').disabled = s.phase !== 'betting' || !Object.keys(s.bets).length;

    const ol = el('board');
    ol.replaceChildren();
    for (const p of s.players) {
      const li = node('li', p.id === store.selfId ? 'me' : '');
      const d = s.lastDelta[p.id];
      const sc = node('b', null, String(p.balance));
      if (d) sc.append(node('small', d > 0 ? 'gain' : 'loss', ` ${d > 0 ? '+' : ''}${d}`));
      li.append(node('span', null, p.name), sc);
      ol.append(li);
    }
    const h = el('history');
    h.replaceChildren(...s.history.map((d) => node('div', 'bc-roll', d.map((x) => ICON[x]).join(''))));
  }

  function tick() {
    if (!state) return;
    const bar = el('timer');
    const left = Math.max(0, state.remainingMs - (Date.now() - receivedAt));
    bar.style.width = state.phase === 'idle' ? '0%' : `${(left / state.totalMs) * 100}%`;
    bar.classList.toggle('low', state.phase === 'betting' && left < 5000);
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (s.phase === 'rolling' && prev?.phase !== 'rolling') sound.play('start');
    if (s.phase === 'result' && prev?.phase !== 'result') {
      const d = s.lastDelta[store.selfId];
      if (d !== undefined) sound.play(d > 0 ? 'win' : d < 0 ? 'wrong' : 'pop');
    }
    view3d?.setState(s);
    render();
  };

  return {
    title: '🎲 Sòng Bầu Cua',
    open(view) {
      view3d = view;
      if (view) view.onBet = bet;
      root.hidden = false;
      socket.on('baucua:state', onState);
      socket.emit('baucua:sync');
      timer = setInterval(tick, 150);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('baucua:state', onState);
      clearInterval(timer);
      state = null;
    },
  };
}
