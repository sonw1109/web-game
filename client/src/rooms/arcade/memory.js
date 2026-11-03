// 🃏 Lật Hình – UI
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './memory.css';

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="mm-status" data-el="status"></div>
    <div class="timer-bar"><div data-el="timer"></div></div>
    <div class="mm-board" data-el="board"></div>
    <div class="mm-cta" data-el="cta"></div>
  </div>
  <aside class="game-side">
    <h3>Bàn chơi <span class="muted small" data-el="count"></span></h3>
    <ul class="mm-seats" data-el="seats"></ul>
    <div class="mm-actions" data-el="actions"></div>
    <p class="muted small">Luật: 2–6 người ngồi vào bàn, lần lượt lật 2 thẻ. Trùng hình → ăn cặp (+10 điểm) và được lật tiếp; không trùng → thẻ úp lại, tới lượt người sau. Mỗi lượt 20 giây. Hết thẻ, ai nhiều cặp nhất thắng (+30). Người không ngồi bàn là khán giả.</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-memory');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null, cards = [], lastDraw = '';

  const seated = () => !!state?.seats.some((p) => p.id === store.selfId);
  const myTurn = () => state?.status === 'playing' && state.turn === store.selfId && !state.hiding;
  const btn = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn;
    return b;
  };

  function buildBoard() {
    const board = el('board');
    board.replaceChildren();
    board.style.setProperty('--cols', state.cols);
    board.style.setProperty('--rows', state.rows);
    cards = state.cards.map((_, i) => {
      const c = document.createElement('button');
      c.className = 'mm-card';
      c.setAttribute('aria-label', `Thẻ ${i + 1}`);
      c.innerHTML = '<span class="mm-inner"><span class="mm-face mm-front">?</span><span class="mm-face mm-back"></span></span>';
      c.onclick = () => { if (myTurn()) socket.emit('memory:flip', i); };
      board.append(c);
      return c;
    });
  }

  function render() {
    const s = state;
    if (!s) return;
    if (cards.length !== s.cards.length) buildBoard();
    const mine = myTurn();
    s.cards.forEach((card, i) => {
      const c = cards[i];
      const face = c.querySelector('.mm-back');
      const isUp = !!card.e;
      clearTimeout(c._clr);
      if (isUp) face.textContent = card.e;   // emoji từ server
      else if (face.textContent) c._clr = setTimeout(() => { face.textContent = ''; }, 450); // úp xong thì xóa mặt
      c.classList.toggle('up', isUp);
      c.classList.toggle('done', !!card.by);
      c.classList.toggle('mine', card.by === store.selfId);
      c.classList.toggle('miss', s.hiding && s.flipped.includes(i));
      c.disabled = !mine || isUp;
    });
    el('board').classList.toggle('my-turn', mine);
    el('board').classList.toggle('empty', !s.cards.length);

    const turnName = s.seats.find((p) => p.id === s.turn)?.name ?? '?';
    let msg;
    if (s.status === 'waiting') msg = s.seats.length < 2 ? '🃏 Ngồi vào bàn – cần ít nhất 2 người' : '🃏 Đủ người rồi! Bấm bắt đầu';
    else if (s.status === 'playing') msg = s.hiding ? (s.turn === store.selfId ? '😅 Không trùng! Hết lượt' : `😅 ${turnName} lật trượt`) : mine ? '👉 Tới lượt bạn – lật 2 thẻ!' : `⏳ Lượt của ${turnName}`;
    else msg = s.winners.length ? `🏆 ${s.winners.map((w) => w.name).join(', ')} thắng! (${s.reason})` : `Hết ván (${s.reason})`;
    el('status').textContent = msg;

    // nút lớn trên bàn
    const cta = el('cta');
    cta.replaceChildren();
    if (s.status !== 'playing') {
      if (!seated() && s.seats.length < s.maxSeats) cta.append(btn('🪑 Ngồi vào bàn', 'btn-primary btn-big', () => socket.emit('memory:join')));
      else if (seated() && s.seats.length >= 2) {
        cta.append(btn('▶ 4×4 · 8 cặp', 'btn-primary btn-big', () => socket.emit('memory:start', 8)));
        cta.append(btn('▶ 6×4 · 12 cặp', 'btn-primary btn-big', () => socket.emit('memory:start', 12)));
      } else if (seated()) {
        const w = document.createElement('span'); w.className = 'muted'; w.textContent = '⏳ Chờ thêm người… (hoặc mời 🤖 bot)';
        cta.append(w);
      }
    }
    cta.hidden = !cta.children.length;

    // ghế
    el('count').textContent = `(${s.seats.length}/${s.maxSeats})`;
    const ul = el('seats');
    ul.replaceChildren();
    s.seats.forEach((p) => {
      const li = document.createElement('li');
      li.className = `${p.id === s.turn && s.status === 'playing' ? 'turn' : ''}${p.id === store.selfId ? ' me' : ''}`;
      const n = document.createElement('span');
      n.textContent = `${p.id === s.host ? '👑 ' : ''}${p.name}${p.id === store.selfId ? ' (bạn)' : ''}`;
      const b = document.createElement('b'); b.textContent = `${p.pairs} cặp`;
      li.append(n, b); ul.append(li);
    });
    if (!s.seats.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Chưa ai ngồi'; ul.append(li); }

    const act = el('actions');
    act.replaceChildren();
    if (seated()) act.append(btn('🚶 Rời bàn', 'btn-ghost btn-sm', () => socket.emit('memory:leave')));
    else if (s.status === 'playing') { const w = document.createElement('span'); w.className = 'muted'; w.textContent = '👀 Bạn đang xem'; act.append(w); }

    view3d?.setPlayers(s.seats.map((p) => p.id));
    drawTable();
  }

  function drawTable() {
    const s = state;
    const key = JSON.stringify([s.cards, s.status]);
    if (!view3d || key === lastDraw) return;
    lastDraw = key;
    view3d.drawTable((c, w, h) => {
      c.fillStyle = '#5a1a14'; c.fillRect(20, 20, w - 40, h - 40);
      if (!s.cards.length) {
        c.font = '220px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🃏', w / 2, h / 2);
        return;
      }
      const pad = 50, gap = 14;
      const cw = (w - pad * 2 - gap * (s.cols - 1)) / s.cols;
      const ch = Math.min(cw * 1.3, (h - pad * 2 - gap * (s.rows - 1)) / s.rows);
      const oy = (h - (ch * s.rows + gap * (s.rows - 1))) / 2;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      s.cards.forEach((card, i) => {
        const x = pad + (i % s.cols) * (cw + gap), y = oy + Math.floor(i / s.cols) * (ch + gap);
        c.fillStyle = card.by ? '#2e7d4f' : card.e ? '#fff4dc' : '#c0392b';
        rr(c, x, y, cw, ch, 14); c.fill();
        c.strokeStyle = card.e ? '#f5c86a' : '#ffb3a6'; c.lineWidth = 4; c.stroke();
        c.font = `${Math.round(cw * 0.55)}px sans-serif`;
        c.fillStyle = '#fff';
        c.fillText(card.e || '?', x + cw / 2, y + ch / 2 + 4);
      });
    });
  }

  function tickTimer() {
    if (!state || state.status !== 'playing') { el('timer').style.width = '0%'; return; }
    const left = Math.max(0, state.remainingMs - (Date.now() - receivedAt));
    el('timer').style.width = `${(left / state.turnMs) * 100}%`;
    el('timer').classList.toggle('low', left < 6000);
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (prev) {
      if (prev.status !== 'playing' && s.status === 'playing') { sound.play('start'); cards = []; }
      else if (s.last && JSON.stringify(s.last) !== JSON.stringify(prev.last) && s.last.type === 'match') sound.play('correct');
      else if (s.hiding && !prev.hiding) sound.play('wrong');
      else if (s.flipped.length > prev.flipped.length) sound.play('pop');
      if (prev.status === 'playing' && s.status === 'over') sound.play(s.winners.some((w) => w.id === store.selfId) ? 'win' : 'pop');
      if (s.status === 'playing' && s.turn === store.selfId && prev.turn !== store.selfId) sound.play('tick');
    }
    render();
  };

  return {
    title: '🃏 Lật Hình',
    open(view) {
      view3d = view; lastDraw = '';
      root.hidden = false;
      socket.on('memory:state', onState);
      socket.emit('memory:sync');
      timer = setInterval(tickTimer, 200);
    },
    close() {
      root.hidden = true;
      socket.off('memory:state', onState);
      clearInterval(timer);
      view3d = null; state = null; cards = [];
    },
  };
}

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
