// ⭕ Quán Caro – UI
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from '../ui/sound.js';

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="caro-status" data-el="status"></div>
    <div class="caro-cta" data-el="cta"></div>
    <div class="timer-bar"><div data-el="timer"></div></div>
    <div class="caro-board" data-el="board"></div>
  </div>
  <aside class="game-side">
    <h3>Người chơi</h3>
    <div class="seat seat-x" data-seat="X"></div>
    <div class="seat seat-o" data-seat="O"></div>
    <div class="caro-actions" data-el="actions"></div>
    <p class="muted small">Luật: 5 ô liên tiếp (ngang, dọc, chéo) là thắng. Mỗi nước tối đa 30 giây. Người thứ 3 trở đi vào xem.</p>
  </aside>
</div>`;

export function createCaroRoom() {
  const root = document.getElementById('room-caro');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, cells = [];

  const mySeat = () => (state?.seats.X?.id === store.selfId ? 'X' : state?.seats.O?.id === store.selfId ? 'O' : null);

  function buildBoard(size) {
    const b = el('board');
    b.style.setProperty('--n', size);
    b.replaceChildren();
    cells = [];
    for (let i = 0; i < size * size; i++) {
      const c = document.createElement('button');
      c.className = 'cell';
      c.onclick = () => socket.emit('caro:move', i);
      b.append(c);
      cells.push(c);
    }
  }

  function renderSeat(seat) {
    const box = root.querySelector(`[data-seat="${seat}"]`);
    const s = state.seats[seat];
    box.replaceChildren();
    const mark = document.createElement('span');
    mark.className = `mark mark-${seat.toLowerCase()}`;
    mark.textContent = seat === 'X' ? '✕' : '◯';
    const info = document.createElement('div');
    info.className = 'seat-info';
    if (s) {
      const n = document.createElement('b'); n.textContent = s.name + (s.id === store.selfId ? ' (bạn)' : '');
      const w = document.createElement('small'); w.textContent = `${s.wins} ván thắng`;
      info.append(n, w);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = `Ngồi vào ${seat}`;
      btn.disabled = !!mySeat() || state.status === 'playing';
      btn.onclick = () => socket.emit('caro:sit', seat);
      info.append(btn);
    }
    box.classList.toggle('active', state.status === 'playing' && state.turn === seat);
    box.append(mark, info);
  }

  function render() {
    if (!state) return;
    if (cells.length !== state.size * state.size) buildBoard(state.size);
    const me = mySeat();
    const myTurn = state.status === 'playing' && state.turn === me;
    const win = new Set(state.winLine);
    state.board.forEach((v, i) => {
      const c = cells[i];
      c.textContent = v === 'X' ? '✕' : v === 'O' ? '◯' : '';
      c.className = `cell${v ? ` v-${v.toLowerCase()}` : ''}${i === state.lastMove ? ' last' : ''}${win.has(i) ? ' win' : ''}`;
      c.disabled = !myTurn || !!v;
    });
    el('board').classList.toggle('my-turn', myTurn);
    el('board').dataset.turn = state.turn.toLowerCase();

    renderSeat('X'); renderSeat('O');

    const name = (seat) => state.seats[seat]?.name ?? seat;
    let msg;
    if (state.status === 'waiting') msg = 'Đang chờ đủ 2 người ngồi vào bàn…';
    else if (state.status === 'playing') msg = myTurn ? '👉 Tới lượt bạn!' : `Lượt của ${name(state.turn)} (${state.turn === 'X' ? '✕' : '◯'})`;
    else msg = state.winner === 'draw' ? '🤝 Hòa!' : `🏆 ${name(state.winner)} thắng – ${state.reason}`;
    el('status').textContent = msg;

    // Nút lớn ngay trên bàn cờ
    const cta = el('cta');
    cta.replaceChildren();
    const freeSeat = ['X', 'O'].find((k) => !state.seats[k]);
    const big = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-big'; b.textContent = label; b.onclick = fn;
      cta.append(b);
    };
    if (state.status !== 'playing') {
      if (me && state.status === 'over' && state.seats.X && state.seats.O) big('▶ Chơi ván mới', () => socket.emit('caro:rematch'));
      else if (!me && freeSeat) big('▶ Chơi ngay', () => socket.emit('caro:sit', freeSeat));
      else if (me) { const w = document.createElement('span'); w.className = 'muted'; w.textContent = '⏳ Đang chờ đối thủ ngồi vào bàn…'; cta.append(w); }
    }
    cta.hidden = !cta.children.length;

    const actions = el('actions');
    actions.replaceChildren();
    const add = (label, ev, cls = 'btn-ghost') => {
      const b = document.createElement('button');
      b.className = `btn btn-sm ${cls}`; b.textContent = label; b.onclick = () => socket.emit(ev);
      actions.append(b);
    };
    if (me) {
      if (state.status === 'playing') add('🏳️ Đầu hàng', 'caro:surrender');
      if (state.status !== 'playing') { add('⇄ Đổi bên', 'caro:swap'); add('🚶 Đứng dậy', 'caro:stand'); }
    } else if (state.status === 'playing') {
      const s = document.createElement('span'); s.className = 'muted'; s.textContent = '👀 Bạn đang xem';
      actions.append(s);
    }
  }

  function tickTimer() {
    if (!state || state.status !== 'playing') { el('timer').style.width = '0%'; return; }
    const left = Math.max(0, state.remainingMs - (Date.now() - receivedAt));
    el('timer').style.width = `${(left / state.turnMs) * 100}%`;
    el('timer').classList.toggle('low', left < 8000);
  }

  let view3d = null;
  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    view3d?.setState(s);
    if (prev && s.lastMove !== prev.lastMove && s.lastMove >= 0) sound.play('move');
    if (prev?.status === 'playing' && s.status === 'over') sound.play(s.winner === mySeat() ? 'win' : 'wrong');
    if (prev?.status !== 'playing' && s.status === 'playing') sound.play('start');
    render();
  };

  return {
    title: '⭕ Quán Caro',
    open(view) {
      view3d = view;
      if (view) view.onCell = (i) => socket.emit('caro:move', i);
      root.hidden = false;
      socket.on('caro:state', onState);
      socket.emit('caro:sync');
      timer = setInterval(tickTimer, 200);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('caro:state', onState);
      clearInterval(timer);
      state = null;
    },
  };
}
