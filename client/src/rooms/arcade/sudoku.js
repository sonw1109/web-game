// 🔢 Sudoku Hợp Sức – UI. Ghi chú bút chì chỉ lưu ở máy này.
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './sudoku.css';

const DIFFS = [['easy', 'Dễ'], ['medium', 'Vừa'], ['hard', 'Khó']];

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="sdk-top">
      <span data-el="status"></span>
      <span class="sdk-clock" data-el="clock">⏱ 0:00</span>
    </div>
    <div class="sdk-wrap">
      <div class="sdk-board" data-el="board"></div>
      <div class="sdk-pad" data-el="pad"></div>
    </div>
  </div>
  <aside class="game-side">
    <h3>Bảng điểm ván</h3>
    <ol class="sdk-score" data-el="score"></ol>
    <h3>Bảng mới</h3>
    <div class="sdk-new" data-el="new"></div>
    <p class="muted small" data-el="newhint"></p>
    <p class="muted small">Cả phòng cùng giải 1 bảng. Bấm ô rồi chọn số (hoặc gõ phím 1–9, mũi tên để di chuyển, Backspace để xóa ghi chú).
    Điền đúng +10 điểm, sai −5. Bút chì ✏️ để ghi chú nháp – chỉ bạn thấy. Xong bảng, ai nhiều điểm nhất thắng.</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-sudoku');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null;
  let sel = -1, pencil = false, notesRound = -1;
  /** Ghi chú bút chì: ô → Set chữ số */
  let notes = new Map();
  const cells = [];
  const flash = new Map(); // ô → { v, until } số sai hiện đỏ thoáng qua

  // --- dựng lưới 9×9 ---
  const board = el('board');
  for (let i = 0; i < 81; i++) {
    const c = document.createElement('button');
    c.className = 'sdk-cell';
    const r = Math.floor(i / 9), col = i % 9;
    if (col % 3 === 2 && col < 8) c.classList.add('bR');
    if (r % 3 === 2 && r < 8) c.classList.add('bB');
    c.onclick = () => { sel = i; render(); };
    board.append(c);
    cells.push(c);
  }
  // --- bàn phím số ---
  const pad = el('pad');
  const padBtns = [];
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = 'btn btn-ghost sdk-key';
    b.textContent = d;
    b.onclick = () => input(d);
    pad.append(b); padBtns.push(b);
  }
  const erase = document.createElement('button');
  erase.className = 'btn btn-ghost sdk-key'; erase.textContent = '⌫'; erase.title = 'Xóa ghi chú';
  erase.onclick = () => input(0);
  const pen = document.createElement('button');
  pen.className = 'btn btn-ghost sdk-key sdk-pen'; pen.textContent = '✏️'; pen.title = 'Bút chì (ghi chú)';
  pen.onclick = () => { pencil = !pencil; render(); };
  pad.append(erase, pen);

  function input(d) {
    if (!state || sel < 0 || state.board[sel]) return;
    if (d === 0) { notes.delete(sel); render(); return; }
    if (pencil) {
      const set = notes.get(sel) || new Set();
      set.has(d) ? set.delete(d) : set.add(d);
      set.size ? notes.set(sel, set) : notes.delete(sel);
      render();
      return;
    }
    if (state.status !== 'playing') return;
    const i = sel;
    socket.emit('sudoku:fill', { i, v: d }, (res) => {
      if (!res?.ok) return;
      if (res.right) { sound.play('correct'); clearNotesAround(i, d); }
      else {
        sound.play('wrong');
        flash.set(i, { v: d, until: Date.now() + 900 });
        render();
        setTimeout(() => { flash.delete(i); render(); }, 950);
      }
    });
  }
  /** Điền đúng → bỏ ghi chú chữ số đó ở hàng/cột/khối. */
  function clearNotesAround(i, d) {
    notes.delete(i);
    for (const [k, set] of notes) if (peers(i, k)) { set.delete(d); if (!set.size) notes.delete(k); }
  }
  const peers = (a, b) => {
    const ra = Math.floor(a / 9), ca = a % 9, rb = Math.floor(b / 9), cb = b % 9;
    return ra === rb || ca === cb || (Math.floor(ra / 3) === Math.floor(rb / 3) && Math.floor(ca / 3) === Math.floor(cb / 3));
  };

  function render() {
    if (!state) return;
    const selVal = sel >= 0 ? state.board[sel] : 0;
    const counts = new Array(10).fill(0);
    state.board.forEach((v) => counts[v]++);
    for (let i = 0; i < 81; i++) {
      const c = cells[i], v = state.board[i], f = flash.get(i);
      const cls = ['sdk-cell'];
      const r = Math.floor(i / 9), col = i % 9;
      if (col % 3 === 2 && col < 8) cls.push('bR');
      if (r % 3 === 2 && r < 8) cls.push('bB');
      if (state.givens[i]) cls.push('given');
      if (sel >= 0 && i !== sel && peers(sel, i)) cls.push('peer');
      if (selVal && v === selVal) cls.push('same');
      if (i === sel) cls.push('sel');
      c.className = cls.join(' ');
      c.style.color = '';
      c.replaceChildren();
      if (f) { c.textContent = f.v; c.classList.add('wrong'); }
      else if (v) {
        c.textContent = v;
        const who = state.by[i] >= 0 ? state.players[state.by[i]] : null;
        if (who) { c.style.color = who.color; c.title = who.name; } else c.title = '';
      } else if (notes.has(i)) {
        const g = document.createElement('div'); g.className = 'sdk-notes';
        for (let d = 1; d <= 9; d++) { const s = document.createElement('span'); s.textContent = notes.get(i).has(d) ? d : ''; g.append(s); }
        c.append(g);
      }
    }
    padBtns.forEach((b, k) => { b.disabled = counts[k + 1] >= 9; });
    pen.classList.toggle('btn-primary', pencil);
    pen.classList.toggle('btn-ghost', !pencil);

    // trạng thái
    const diffLabel = DIFFS.find(([k]) => k === state.diff)?.[1] ?? '';
    const left = state.board.filter((v) => !v).length;
    let msg = `Bảng ${diffLabel} · còn ${left} ô`;
    if (state.status === 'done') {
      const names = state.winners.map((id) => state.players.find((p) => p.id === id)?.name).filter(Boolean);
      msg = `🎉 Giải xong!${names.length ? ` 🏆 ${names.join(', ')}` : ''}`;
    }
    el('status').textContent = msg;

    // bảng điểm (textContent – chống XSS)
    const list = el('score');
    list.replaceChildren();
    const sorted = [...state.players].sort((a, b) => b.pts - a.pts);
    if (!sorted.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Chưa ai điền ô nào'; list.append(li); }
    for (const p of sorted) {
      const li = document.createElement('li');
      const dot = document.createElement('i'); dot.style.background = p.color;
      const n = document.createElement('span'); n.textContent = p.name + (p.id === store.selfId ? ' (bạn)' : '');
      const pts = document.createElement('b'); pts.textContent = `${p.pts} đ`;
      const sm = document.createElement('small'); sm.className = 'muted'; sm.textContent = `✔${p.right} ✘${p.wrong}`;
      li.append(dot, n, sm, pts);
      if (state.winners.includes(p.id)) li.classList.add('win');
      list.append(li);
    }
    renderNew();
  }

  function renderNew() {
    const box = el('new');
    const wait = Math.max(0, state.newInMs - (Date.now() - receivedAt));
    if (box.childElementCount !== DIFFS.length) {
      box.replaceChildren();
      for (const [k, label] of DIFFS) {
        const b = document.createElement('button');
        b.className = 'btn btn-sm btn-primary'; b.textContent = `▶ ${label}`; b.dataset.diff = k;
        b.onclick = () => socket.emit('sudoku:new', k, (res) => { if (res && !res.ok && res.error) store.emit?.('toast', res.error); });
        box.append(b);
      }
    }
    for (const b of box.children) b.disabled = wait > 0;
    el('newhint').textContent = state.status === 'done' ? 'Chọn độ khó cho bảng tiếp theo.'
      : wait > 0 ? `Đang giải dở – đổi bảng được sau ${Math.ceil(wait / 1000)} giây không ai điền.` : 'Không ai điền 10 giây – có thể bỏ bảng này.';
  }

  function tick() {
    if (!state) return;
    const ms = state.elapsedMs + (state.status === 'playing' ? Date.now() - receivedAt : 0);
    const sec = Math.floor(ms / 1000);
    el('clock').textContent = `⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    renderNew();
  }

  function draw3d() {
    if (!view3d || !state) return;
    const st = state;
    view3d.drawTable((c, w, h) => {
      const pad = 54, size = w - pad * 2, cs = size / 9;
      c.fillStyle = '#f6efe0'; c.fillRect(pad, pad, size, size);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `bold ${cs * 0.62}px Outfit, sans-serif`;
      for (let i = 0; i < 81; i++) {
        const v = st.board[i]; if (!v) continue;
        const x = pad + (i % 9) * cs, y = pad + Math.floor(i / 9) * cs;
        const who = st.by[i] >= 0 ? st.players[st.by[i]] : null;
        if (who) { c.fillStyle = who.color + '55'; c.fillRect(x + 2, y + 2, cs - 4, cs - 4); }
        c.fillStyle = who ? '#222' : '#1b2a4a';
        c.fillText(String(v), x + cs / 2, y + cs / 2 + 2);
      }
      c.strokeStyle = '#1b2a4a';
      for (let k = 0; k <= 9; k++) {
        c.lineWidth = k % 3 === 0 ? 6 : 1.5;
        c.beginPath(); c.moveTo(pad + k * cs, pad); c.lineTo(pad + k * cs, pad + size); c.stroke();
        c.beginPath(); c.moveTo(pad, pad + k * cs); c.lineTo(pad + size, pad + k * cs); c.stroke();
      }
    });
    view3d.setPlayers(st.players.filter((p) => store.players.get(p.id)?.room === 'sudoku').sort((a, b) => b.pts - a.pts).slice(0, 6).map((p) => p.id));
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (s.round !== notesRound) { notes = new Map(); notesRound = s.round; if (prev) sel = -1; }
    if (prev && prev.round !== s.round) sound.play('start');
    if (prev?.status === 'playing' && s.status === 'done') sound.play(s.winners.includes(store.selfId) ? 'win' : 'correct');
    else if (prev && prev.round === s.round && prev.board.join() !== s.board.join()) sound.play('pop');
    render();
    draw3d();
  };

  const onKey = (e) => {
    if (!state || e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (/^[1-9]$/.test(e.key)) { input(+e.key); e.preventDefault(); e.stopPropagation(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { input(0); e.preventDefault(); e.stopPropagation(); return; }
    const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (mv) {
      e.preventDefault(); e.stopPropagation();
      if (sel < 0) sel = 40;
      else {
        const r = Math.floor(sel / 9), c = sel % 9;
        if (mv === -1) sel = r * 9 + (c + 8) % 9; else if (mv === 1) sel = r * 9 + (c + 1) % 9;
        else sel = (sel + mv + 81) % 81;
      }
      render();
    }
  };

  return {
    title: '🔢 Sudoku Hợp Sức',
    open(view) {
      view3d = view;
      root.hidden = false;
      socket.on('sudoku:state', onState);
      socket.emit('sudoku:sync');
      window.addEventListener('keydown', onKey, true);
      timer = setInterval(tick, 500);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('sudoku:state', onState);
      window.removeEventListener('keydown', onKey, true);
      clearInterval(timer);
      state = null; sel = -1;
    },
  };
}
