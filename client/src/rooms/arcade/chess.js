// ♟️ Cờ Vua – UI. Server là trọng tài: client chỉ tô ô đi được theo `legal` server gửi xuống.
// Ô 0 = a8 … ô 63 = h1. Người cầm quân đen thì bàn cờ được xoay ngược lại.
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './chess.css';

// Dùng glyph "đặc" cho cả 2 màu (tô màu bằng CSS) cho dễ nhìn; ︎ ép hiển thị dạng chữ, không thành emoji
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const GLYPH_W = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
const glyph = (p) => (p ? `${GLYPH[p.toLowerCase()]}︎` : '');
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = 'abcdefgh';
const isWhite = (p) => !!p && p === p.toUpperCase();
const colorOf = (p) => (p ? (isWhite(p) ? 'w' : 'b') : null);
const LABEL = { w: 'Trắng', b: 'Đen' };

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="chess-status" data-el="status"></div>
    <div class="chess-wrap">
      <div class="chess-bar" data-el="barTop"></div>
      <div class="chess-board-box">
        <div class="chess-board" data-el="board"></div>
        <div class="chess-promo" data-el="promo" hidden>
          <div class="chess-promo-card">
            <b>Phong cấp thành…</b>
            <div class="chess-promo-row" data-el="promoRow"></div>
            <button class="btn btn-ghost btn-sm" data-el="promoCancel">Hủy</button>
          </div>
        </div>
      </div>
      <div class="chess-bar" data-el="barBottom"></div>
    </div>
    <div class="chess-cta" data-el="cta"></div>
  </div>
  <aside class="game-side">
    <h3>Người chơi</h3>
    <div class="chess-seat" data-seat="w"></div>
    <div class="chess-seat" data-seat="b"></div>
    <div class="chess-offer" data-el="offer" hidden></div>
    <div class="chess-actions" data-el="actions"></div>
    <h3>Nước đi</h3>
    <ol class="chess-moves" data-el="moves"></ol>
    <p class="muted small">Luật cờ vua quốc tế đầy đủ: nhập thành, bắt tốt qua đường, phong cấp. Mỗi bên 5 phút, cộng 3 giây
      mỗi nước – hết giờ là thua. Hòa khi hết nước đi (pat), không đủ quân chiếu hết, 50 nước không ăn quân/đi tốt, lặp lại
      thế cờ 3 lần, hoặc hai bên đồng ý. Rời bàn khi đang chơi = thua. Thắng +30 điểm, hòa +10 điểm.
      Bấm quân để chọn rồi bấm ô sáng (hoặc kéo thả).</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-chess');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null;
  let sel = -1, promoPending = null, surrenderArmed = 0;
  const squares = [];   // 64 nút theo thứ tự HIỂN THỊ
  const clockEls = { w: [], b: [] };

  const mySeat = () => (state?.seats.w?.id === store.selfId ? 'w' : state?.seats.b?.id === store.selfId ? 'b' : null);
  const flipped = () => mySeat() === 'b';
  const sqAt = (k) => (flipped() ? 63 - k : k);
  const myTurn = () => state?.status === 'playing' && state.turn === mySeat();
  const nameOf = (c) => state?.seats[c]?.name ?? LABEL[c];

  // ---------- Bàn cờ ----------
  const board = el('board');
  for (let k = 0; k < 64; k++) {
    const b = document.createElement('button');
    b.type = 'button';
    const piece = document.createElement('span');
    piece.className = 'pc';
    const co = document.createElement('i');
    co.className = 'co';
    const r = document.createElement('span'); r.className = 'r';
    const f = document.createElement('span'); f.className = 'f';
    co.append(r, f);
    b.append(piece, co);
    b.onclick = () => onSquare(sqAt(k));
    b.addEventListener('dragover', (e) => { if (sel >= 0 && state?.legal[sel]?.includes(sqAt(k))) e.preventDefault(); });
    b.addEventListener('drop', (e) => { e.preventDefault(); const to = sqAt(k); if (sel >= 0 && state?.legal[sel]?.includes(to)) tryMove(sel, to); });
    piece.addEventListener('dragstart', (e) => {
      const from = sqAt(k);
      if (!myTurn() || !state.legal[from]) { e.preventDefault(); return; }
      sel = from; e.dataTransfer?.setData('text/plain', String(from));
      requestAnimationFrame(render); // tô ô sau khi trình duyệt chụp ảnh quân đang kéo
    });
    board.append(b);
    squares.push(b);
  }

  function onSquare(sq) {
    if (!state || promoPending) return;
    if (!myTurn()) { sel = -1; render(); return; }
    if (sel >= 0 && state.legal[sel]?.includes(sq)) { tryMove(sel, sq); return; }
    const p = state.board[sq];
    sel = p && colorOf(p) === mySeat() && state.legal[sq] && sel !== sq ? sq : -1;
    render();
  }
  function tryMove(from, to) {
    const p = state.board[from];
    const lastRow = isWhite(p) ? 0 : 7;
    if (p?.toLowerCase() === 'p' && to >> 3 === lastRow) { askPromo(from, to); return; }
    send({ from, to });
  }
  function send(m) {
    sel = -1; promoPending = null; el('promo').hidden = true;
    socket.emit('chess:move', m, (r) => { if (!r?.ok) sound.play('wrong'); });
    render();
  }
  function askPromo(from, to) {
    promoPending = { from, to };
    const row = el('promoRow');
    row.replaceChildren();
    const white = mySeat() === 'w';
    for (const k of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chess-promo-pc ${white ? 'white' : 'black'}`;
      b.textContent = glyph(k);
      b.title = { q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã' }[k];
      b.onclick = () => send({ ...promoPending, promo: k });
      row.append(b);
    }
    el('promo').hidden = false;
  }
  el('promoCancel').onclick = () => { promoPending = null; sel = -1; el('promo').hidden = true; render(); };

  // ---------- Vẽ ----------
  function renderBoard() {
    const me = mySeat(), turnMine = myTurn();
    const targets = new Set(sel >= 0 ? state.legal[sel] || [] : []);
    const lm = state.lastMove;
    for (let k = 0; k < 64; k++) {
      const sq = sqAt(k), p = state.board[sq];
      const b = squares[k];
      const dark = ((sq >> 3) + (sq & 7)) & 1;
      const cls = ['sq', dark ? 'dark' : 'light'];
      if (lm && (lm.from === sq || lm.to === sq)) cls.push('last');
      if (sq === state.check) cls.push('check');
      if (sq === sel) cls.push('sel');
      if (targets.has(sq)) cls.push(p ? 'target cap' : 'target');
      if (turnMine && p && colorOf(p) === me && state.legal[sq]) cls.push('movable');
      b.className = cls.join(' ');
      const pc = b.firstChild;
      pc.textContent = glyph(p);
      pc.className = `pc ${p ? (isWhite(p) ? 'white' : 'black') : ''}`;
      pc.draggable = !!(turnMine && p && colorOf(p) === me && state.legal[sq]);
      // Tọa độ ở mép bàn
      const row = Math.floor(k / 8), col = k % 8;
      b.lastChild.firstChild.textContent = col === 0 ? String(8 - (sq >> 3)) : '';
      b.lastChild.lastChild.textContent = row === 7 ? FILES[sq & 7] : '';
      b.setAttribute('aria-label', `${FILES[sq & 7]}${8 - (sq >> 3)}${p ? ` ${p}` : ''}`);
    }
    board.classList.toggle('my-turn', turnMine);
  }

  const material = (list) => list.reduce((s, p) => s + VAL[p.toLowerCase()], 0);
  function renderBar(box, c) {
    box.replaceChildren();
    const seat = state.seats[c];
    const dot = document.createElement('span');
    dot.className = `chess-dot ${c === 'w' ? 'white' : 'black'}`;
    dot.textContent = `${GLYPH_W.k}`;
    const n = document.createElement('b');
    n.className = 'chess-name';
    n.textContent = seat ? seat.name + (seat.id === store.selfId ? ' (bạn)' : '') : `${LABEL[c]} – ghế trống`;
    const caps = document.createElement('span');
    caps.className = `chess-caps ${c === 'w' ? 'black' : 'white'}`;
    const mine = state.captured[c] || [], theirs = state.captured[c === 'w' ? 'b' : 'w'] || [];
    caps.textContent = [...mine].sort((a, b) => VAL[b.toLowerCase()] - VAL[a.toLowerCase()]).map(glyph).join('');
    const diff = material(mine) - material(theirs);
    if (diff > 0) { const d = document.createElement('small'); d.textContent = ` +${diff}`; caps.append(d); }
    const clock = document.createElement('span');
    clock.className = 'chess-clock';
    clockEls[c].push(clock);
    box.classList.toggle('active', state.status === 'playing' && state.turn === c);
    box.append(dot, n, caps, clock);
  }

  function renderSeat(c) {
    const box = root.querySelector(`[data-seat="${c}"]`);
    const s = state.seats[c];
    box.replaceChildren();
    const mark = document.createElement('span');
    mark.className = `chess-mark ${c === 'w' ? 'white' : 'black'}`;
    mark.textContent = glyph(c === 'w' ? 'K' : 'k');
    const info = document.createElement('div');
    info.className = 'chess-seat-info';
    if (s) {
      const n = document.createElement('b'); n.textContent = s.name + (s.id === store.selfId ? ' (bạn)' : '');
      const w = document.createElement('small'); w.textContent = `${LABEL[c]} · ${s.wins} ván thắng`;
      info.append(n, w);
    } else {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-sm';
      btn.textContent = `Cầm quân ${LABEL[c]}`;
      btn.disabled = !!mySeat() || state.status === 'playing';
      btn.onclick = () => socket.emit('chess:sit', c);
      info.append(btn);
    }
    const clock = document.createElement('span');
    clock.className = 'chess-clock';
    clockEls[c].push(clock);
    box.classList.toggle('active', state.status === 'playing' && state.turn === c);
    box.append(mark, info, clock);
  }

  function renderMoves() {
    const ol = el('moves');
    ol.replaceChildren();
    const h = state.history;
    for (let i = 0; i < h.length; i += 2) {
      const li = document.createElement('li');
      const a = document.createElement('span'); a.textContent = h[i];
      const b = document.createElement('span'); b.textContent = h[i + 1] ?? '';
      if (i === h.length - 1) a.className = 'cur';
      if (i + 1 === h.length - 1) b.className = 'cur';
      li.append(a, b);
      ol.append(li);
    }
    if (!h.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Chưa có nước nào'; ol.append(li); }
    ol.scrollTop = ol.scrollHeight;
  }

  function render() {
    if (!state) return;
    const me = mySeat();
    renderBoard();
    clockEls.w = []; clockEls.b = [];
    // Thanh trên = đối thủ (theo hướng nhìn), thanh dưới = mình
    const bottom = flipped() ? 'b' : 'w', top = bottom === 'w' ? 'b' : 'w';
    renderBar(el('barTop'), top); renderBar(el('barBottom'), bottom);
    renderSeat('w'); renderSeat('b');
    renderMoves();
    tickClock();

    let msg;
    if (state.status === 'waiting') msg = 'Đang chờ đủ 2 người ngồi vào bàn…';
    else if (state.status === 'playing') {
      const check = state.check >= 0 ? ' – đang bị chiếu! ⚠️' : '';
      msg = myTurn() ? `👉 Tới lượt bạn${check}` : `Lượt của ${nameOf(state.turn)} (${LABEL[state.turn]})${check}`;
    } else msg = state.winner === 'draw' ? `🤝 Hòa – ${state.reason}` : `🏆 ${nameOf(state.winner)} (${LABEL[state.winner]}) thắng – ${state.reason}`;
    el('status').textContent = msg;

    // Nút lớn dưới bàn cờ
    const cta = el('cta');
    cta.replaceChildren();
    const free = ['w', 'b'].find((k) => !state.seats[k]);
    const big = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-big'; b.textContent = label; b.onclick = fn;
      cta.append(b);
    };
    if (state.status !== 'playing') {
      if (me && state.status === 'over' && state.seats.w && state.seats.b) big('▶ Chơi ván mới', () => socket.emit('chess:rematch'));
      else if (!me && free) big(`▶ Chơi ngay (cầm ${LABEL[free]})`, () => socket.emit('chess:sit', free));
      else if (me) { const w = document.createElement('span'); w.className = 'muted chess-wait'; w.textContent = '⏳ Đang chờ đối thủ… (hoặc bấm 🤖 Chơi với bot ở trên)'; cta.append(w); }
    }
    cta.hidden = !cta.children.length;

    // Lời mời hòa
    const offer = el('offer');
    offer.replaceChildren();
    offer.hidden = !(state.status === 'playing' && state.drawOffer);
    if (!offer.hidden) {
      const t = document.createElement('div');
      t.textContent = state.drawOffer === me ? '🤝 Bạn đã xin hòa – chờ đối thủ trả lời…' : `🤝 ${nameOf(state.drawOffer)} xin hòa`;
      offer.append(t);
      if (me && state.drawOffer !== me) {
        const row = document.createElement('div'); row.className = 'chess-offer-row';
        const y = document.createElement('button'); y.className = 'btn btn-primary btn-sm'; y.textContent = 'Đồng ý hòa'; y.onclick = () => socket.emit('chess:acceptDraw');
        const n = document.createElement('button'); n.className = 'btn btn-ghost btn-sm'; n.textContent = 'Từ chối'; n.onclick = () => socket.emit('chess:declineDraw');
        row.append(y, n); offer.append(row);
      }
    }

    const actions = el('actions');
    actions.replaceChildren();
    const add = (label, fn, cls = 'btn-ghost', disabled = false) => {
      const b = document.createElement('button');
      b.className = `btn btn-sm ${cls}`; b.textContent = label; b.onclick = fn; b.disabled = disabled;
      actions.append(b);
    };
    if (me) {
      if (state.status === 'playing') {
        const armed = Date.now() < surrenderArmed;
        add(armed ? '⚠️ Bấm lần nữa để đầu hàng' : '🏳️ Đầu hàng', () => {
          if (Date.now() < surrenderArmed) { surrenderArmed = 0; socket.emit('chess:surrender'); return; }
          surrenderArmed = Date.now() + 3000; render(); setTimeout(render, 3100);
        }, armed ? 'btn-primary' : 'btn-ghost');
        add('🤝 Xin hòa', () => socket.emit('chess:offerDraw'), 'btn-ghost', !!state.drawOffer);
      } else {
        if (state.status === 'over' && state.seats.w && state.seats.b) add('▶ Ván mới', () => socket.emit('chess:rematch'), 'btn-primary');
        add('⇄ Đổi bên', () => socket.emit('chess:swap'));
        add('🚶 Đứng dậy', () => socket.emit('chess:stand'));
      }
    } else if (state.status === 'playing') {
      const s = document.createElement('span'); s.className = 'muted'; s.textContent = '👀 Bạn đang xem';
      actions.append(s);
    }
  }

  // ---------- Đồng hồ ----------
  const fmt = (ms) => {
    ms = Math.max(0, ms);
    if (ms < 10_000) return `0:0${(ms / 1000).toFixed(1)}`;
    const t = Math.ceil(ms / 1000);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  function tickClock() {
    if (!state) return;
    for (const c of ['w', 'b']) {
      const running = state.status === 'playing' && state.turn === c;
      const left = state.clocks[c] - (running ? Date.now() - receivedAt : 0);
      for (const e of clockEls[c]) {
        e.textContent = fmt(left);
        e.classList.toggle('running', running);
        e.classList.toggle('low', left < 20_000);
      }
    }
  }

  // ---------- Mặt bàn 3D ----------
  function drawTable() {
    if (!view3d) return;
    const st = state;
    view3d.setPlayers?.([st.seats.w?.id, st.seats.b?.id]);
    view3d.drawTable?.((c, w, h) => {
      const m = 30, cell = (w - m * 2) / 8;
      c.fillStyle = '#3a2414'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#d9b27c'; c.font = `bold ${Math.round(m * 0.6)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) {
        c.fillText(FILES[i], m + cell * (i + 0.5), h - m / 2);
        c.fillText(String(8 - i), m / 2, m + cell * (i + 0.5));
      }
      for (let sq = 0; sq < 64; sq++) {
        const r = sq >> 3, f = sq & 7, x = m + f * cell, y = m + r * cell;
        c.fillStyle = (r + f) & 1 ? '#b58863' : '#f0d9b5';
        c.fillRect(x, y, cell, cell);
        if (st.lastMove && (st.lastMove.from === sq || st.lastMove.to === sq)) { c.fillStyle = 'rgba(255, 214, 64, .5)'; c.fillRect(x, y, cell, cell); }
        if (sq === st.check) {
          const g = c.createRadialGradient(x + cell / 2, y + cell / 2, 4, x + cell / 2, y + cell / 2, cell * 0.7);
          g.addColorStop(0, 'rgba(255, 40, 40, .95)'); g.addColorStop(1, 'rgba(255, 40, 40, 0)');
          c.fillStyle = g; c.fillRect(x, y, cell, cell);
        }
        const p = st.board[sq];
        if (!p) continue;
        c.font = `${Math.round(cell * 0.82)}px "Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols 2", serif`;
        c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 6; c.shadowOffsetY = 4;
        c.lineWidth = 3; c.strokeStyle = isWhite(p) ? '#2a1a10' : '#f4e6cf';
        c.strokeText(glyph(p), x + cell / 2, y + cell * 0.54);
        c.shadowColor = 'transparent';
        c.fillStyle = isWhite(p) ? '#fffaf0' : '#1d1612';
        c.fillText(glyph(p), x + cell / 2, y + cell * 0.54);
      }
      c.strokeStyle = '#1a0f08'; c.lineWidth = 4; c.strokeRect(m, m, cell * 8, cell * 8);
    });
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    // Nước đi xong / lượt đổi → bỏ chọn
    if (!prev || prev.history.length !== s.history.length || s.status !== 'playing') {
      sel = -1;
      if (promoPending && s.status !== 'playing') { promoPending = null; el('promo').hidden = true; }
    }
    if (prev && s.history.length > prev.history.length) sound.play('move');
    if (prev?.status !== 'playing' && s.status === 'playing') sound.play('start');
    if (prev?.status === 'playing' && s.status === 'over') {
      const me = mySeat();
      sound.play(me && s.winner === me ? 'win' : me && s.winner !== 'draw' ? 'wrong' : 'pop');
    }
    render();
    drawTable();
  };

  return {
    title: '♟️ Cờ Vua',
    open(view) {
      view3d = view || null;
      root.hidden = false;
      socket.on('chess:state', onState);
      socket.emit('chess:sync');
      timer = setInterval(tickClock, 200);
    },
    close() {
      root.hidden = true;
      socket.off('chess:state', onState);
      clearInterval(timer); timer = null;
      view3d = null; state = null; sel = -1; promoPending = null;
      el('promo').hidden = true;
    },
  };
}
