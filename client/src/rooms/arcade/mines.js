// 💣 Dò Mìn Đồng Đội – UI. Chuột trái mở, chuột phải / nhấn giữ cắm cờ, nút ⛏️/🚩 cho điện thoại.
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './mines.css';

const HIDDEN = -1, FLAG = -2, MINE = 9, BOOM = 10, WRONG_FLAG = 11;
const NUM_COLORS = ['', '#4f8cff', '#3fae5a', '#ff5f5f', '#8a6cff', '#c0392b', '#1abc9c', '#eeeeee', '#9aa0c3'];
const HOLD_MS = 380;

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="mn-top">
      <span class="mn-count" data-el="left">💣 40</span>
      <span class="mn-face" data-el="face">🙂</span>
      <span class="mn-count" data-el="clock">⏱ 0</span>
    </div>
    <div class="mn-scroll"><div class="mn-board" data-el="board"></div></div>
    <div class="mn-mode">
      <button class="btn btn-sm btn-primary" data-mode="open">⛏️ Mở</button>
      <button class="btn btn-sm btn-ghost" data-mode="flag">🚩 Cờ</button>
    </div>
  </div>
  <aside class="game-side">
    <h3 data-el="status"></h3>
    <h3>Đội dò mìn</h3>
    <ol class="mn-players" data-el="players"></ol>
    <h3>Ván mới</h3>
    <div class="mn-new" data-el="new">
      <button class="btn btn-sm btn-primary" data-size="s">▶ 9×9 · 10 mìn</button>
      <button class="btn btn-sm btn-primary" data-size="l">▶ 16×16 · 40 mìn</button>
    </div>
    <p class="muted small" data-el="newhint"></p>
    <p class="muted small">Cả phòng chung 1 bãi mìn. Chuột trái mở ô, chuột phải cắm cờ (điện thoại: nhấn giữ, hoặc chuyển nút 🚩 Cờ).
    Bấm vào số đã đủ cờ xung quanh để mở nhanh các ô còn lại. Cú mở đầu tiên luôn an toàn.
    Mỗi ô mở +1 điểm; gỡ sạch mìn cả đội chia nhau +50, người mở nhiều nhất thêm +10. Một người dẫm mìn là cả đội thua!</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-mines');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null, mode = 'open';
  let cells = [], hold = null, suppressClick = false;

  for (const b of root.querySelectorAll('[data-mode]')) {
    b.onclick = () => {
      mode = b.dataset.mode;
      for (const x of root.querySelectorAll('[data-mode]')) { x.classList.toggle('btn-primary', x === b); x.classList.toggle('btn-ghost', x !== b); }
    };
  }
  for (const b of root.querySelectorAll('[data-size]')) {
    b.onclick = () => socket.emit('mines:new', b.dataset.size, (res) => { if (res && !res.ok && res.error) store.emit('toast', res.error); });
  }

  const act = (i, flag) => {
    if (!state || (state.status !== 'playing' && state.status !== 'ready')) return;
    const v = state.cells[i];
    if (flag) { if (v === HIDDEN || v === FLAG) { socket.emit('mines:flag', i); sound.play('tick'); } }
    else if (v !== FLAG) socket.emit('mines:open', i);
  };

  function build(w, h) {
    const b = el('board');
    b.style.setProperty('--w', w); b.style.setProperty('--h', h);
    b.replaceChildren();
    cells = [];
    for (let i = 0; i < w * h; i++) {
      const c = document.createElement('button');
      c.className = 'mn-cell';
      c.onclick = () => { if (suppressClick) { suppressClick = false; return; } act(i, mode === 'flag'); };
      c.oncontextmenu = (e) => { e.preventDefault(); if (!hold?.fired) act(i, true); };
      c.addEventListener('touchstart', () => {
        clearTimeout(hold?.t);
        suppressClick = false;
        hold = { i, fired: false, t: setTimeout(() => { hold.fired = true; suppressClick = true; act(i, mode !== 'flag'); navigator.vibrate?.(20); }, HOLD_MS) };
      }, { passive: true });
      const cancel = () => { if (hold && !hold.fired) clearTimeout(hold.t); };
      c.addEventListener('touchend', cancel);
      c.addEventListener('touchmove', cancel, { passive: true });
      c.addEventListener('touchcancel', cancel);
      b.append(c);
      cells.push(c);
    }
  }

  function render() {
    if (!state) return;
    if (cells.length !== state.w * state.h) build(state.w, state.h);
    const over = state.status === 'won' || state.status === 'lost';
    state.cells.forEach((v, i) => {
      const c = cells[i];
      let cls = 'mn-cell', txt = '', color = '';
      if (v === HIDDEN) cls += ' hid';
      else if (v === FLAG) { cls += ' hid flag'; txt = '🚩'; }
      else if (v === MINE) { cls += ' mine'; txt = '💣'; }
      else if (v === BOOM) { cls += ' mine boom'; txt = '💥'; }
      else if (v === WRONG_FLAG) { cls += ' hid wrongflag'; txt = '❌'; }
      else { cls += ' open'; if (v > 0) { txt = String(v); color = NUM_COLORS[v]; } }
      c.style.color = color;
      if (c.className !== cls) c.className = cls;
      if (c.textContent !== txt) c.textContent = txt;
      c.disabled = over;
    });
    el('left').textContent = `💣 ${state.minesLeft}`;
    el('face').textContent = state.status === 'lost' ? '😵' : state.status === 'won' ? '😎' : '🙂';
    el('status').textContent = {
      ready: '🙂 Bấm ô bất kỳ để bắt đầu',
      playing: '⛏️ Đang dò…',
      won: '🎉 Cả đội thắng!',
      lost: '💥 Nổ rồi – cả đội thua',
    }[state.status];

    const list = el('players');
    list.replaceChildren();
    if (!state.players.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Chưa ai ra tay'; list.append(li); }
    for (const p of state.players) {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.textContent = p.name + (p.id === store.selfId ? ' (bạn)' : '');
      const b = document.createElement('b'); b.textContent = `${p.opened} ô`;
      li.append(n, b);
      list.append(li);
    }
    renderNew();
  }

  function renderNew() {
    const wait = Math.max(0, state.newInMs - (Date.now() - receivedAt));
    for (const b of root.querySelectorAll('[data-size]')) b.disabled = wait > 0;
    el('newhint').textContent = wait > 0 ? `Đội đang dò – đổi ván được sau ${Math.ceil(wait / 1000)} giây không ai thao tác.` : '';
  }

  function tick() {
    if (!state) return;
    const ms = state.elapsedMs + (state.status === 'playing' ? Date.now() - receivedAt : 0);
    el('clock').textContent = `⏱ ${Math.min(999, Math.floor(ms / 1000))}`;
    renderNew();
  }

  function draw3d() {
    if (!view3d || !state) return;
    const st = state;
    view3d.drawTable((c, w) => {
      const pad = 40, cs = (w - pad * 2) / Math.max(st.w, st.h);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${cs * 0.62}px Outfit, sans-serif`;
      st.cells.forEach((v, i) => {
        const x = pad + (i % st.w) * cs, y = pad + Math.floor(i / st.w) * cs;
        const hidden = v === HIDDEN || v === FLAG || v === WRONG_FLAG;
        c.fillStyle = v === BOOM ? '#e74c3c' : hidden ? '#6c8f4e' : '#d9cfb8';
        c.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        if (v === FLAG || v === WRONG_FLAG) { c.fillStyle = '#e63b2e'; c.beginPath(); c.moveTo(x + cs * 0.35, y + cs * 0.2); c.lineTo(x + cs * 0.75, y + cs * 0.38); c.lineTo(x + cs * 0.35, y + cs * 0.56); c.fill(); c.fillStyle = '#222'; c.fillRect(x + cs * 0.32, y + cs * 0.2, cs * 0.06, cs * 0.6); }
        else if (v === MINE || v === BOOM) { c.fillStyle = '#111'; c.beginPath(); c.arc(x + cs / 2, y + cs / 2, cs * 0.28, 0, Math.PI * 2); c.fill(); }
        else if (v > 0) { c.fillStyle = ['', '#1d4fc4', '#1f7a35', '#c62828', '#4a2a9c', '#7b1d14', '#0e7d6d', '#222', '#555'][v]; c.fillText(String(v), x + cs / 2, y + cs / 2 + 2); }
      });
    });
    view3d.setPlayers(st.players.filter((p) => store.players.get(p.id)?.room === 'mines').slice(0, 6).map((p) => p.id));
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (prev && prev.round === s.round) {
      if (prev.status !== 'lost' && s.status === 'lost') sound.play('boom');
      else if (prev.status !== 'won' && s.status === 'won') sound.play('win');
      else if (prev.cells.filter((v) => v >= 0).length !== s.cells.filter((v) => v >= 0).length) sound.play('pop');
    } else if (prev) sound.play('start');
    render();
    draw3d();
  };

  return {
    title: '💣 Dò Mìn Đồng Đội',
    open(view) {
      view3d = view;
      root.hidden = false;
      socket.on('mines:state', onState);
      socket.emit('mines:sync');
      timer = setInterval(tick, 500);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('mines:state', onState);
      clearInterval(timer);
      clearTimeout(hold?.t); hold = null;
      state = null;
    },
  };
}
