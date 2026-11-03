// 🔷 2048 – UI. Chơi ngay tại máy (không trễ); mỗi nước gửi lên server để chơi lại và tính điểm chuẩn.
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import { move, maxTile } from '../../game/g2048.js';
import './g2048.css';

const ANIM_MS = 110;
const MIN_GAP_MS = 65;       // ≤ ~15 nước/giây (server cho tối đa 20)
const LS_BEST = 'hoiquan.g2048.best';
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="g2-top">
      <div class="g2-box"><small>ĐIỂM</small><b data-el="score">0</b></div>
      <div class="g2-box"><small>KỶ LỤC</small><b data-el="best">0</b></div>
      <button class="btn btn-primary btn-sm" data-el="restart">↻ Chơi lại</button>
    </div>
    <div class="g2-board" data-el="board">
      <div class="g2-grid">${'<div></div>'.repeat(16)}</div>
      <div class="g2-tiles" data-el="tiles"></div>
      <div class="g2-over" data-el="over" hidden>
        <b data-el="overText">Hết nước!</b>
        <button class="btn btn-primary" data-el="again">↻ Chơi ván mới</button>
      </div>
    </div>
    <p class="muted small g2-hint">Vuốt hoặc dùng phím mũi tên / WASD</p>
  </div>
  <aside class="game-side">
    <h3>Đang chơi</h3>
    <ol class="g2-list" data-el="live"></ol>
    <h3>Điểm cao trong phòng</h3>
    <ol class="g2-list" data-el="top"></ol>
    <p class="muted small">Gộp 2 ô cùng số để được ô gấp đôi – cố đạt 2048! Mỗi người 1 ván riêng; server chơi lại từng nước nên điểm luôn chuẩn.
    Hết nước là kết thúc ván: kỷ lục lên Bảng Vàng, cứ 100 điểm được 1 điểm thưởng.</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-g2048');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  const layer = el('tiles');
  let game = null, serverBest = 0, roomView = null, view3d = null;
  let tiles = new Map();         // ô → phần tử
  let pending = null;            // { timer, finalize }
  let inflight = 0, needSync = false, lastMoveAt = 0, drawTimer = null, starting = false, autoStarted = false;

  const lsBest = () => { try { return +localStorage.getItem(LS_BEST) || 0; } catch { return 0; } };
  const saveBest = (v) => { try { if (v > lsBest()) localStorage.setItem(LS_BEST, String(v)); } catch { /* chế độ riêng tư */ } };

  // --- ô số ---
  const place = (t, i) => { t.style.setProperty('--x', i % 4); t.style.setProperty('--y', Math.floor(i / 4)); };
  const setVal = (t, v) => { t.textContent = v; t.dataset.v = v > 2048 ? 'big' : v; t.classList.toggle('long', v >= 1024); };
  const makeTile = (i, v, cls = '') => {
    const t = document.createElement('div');
    t.className = `g2-tile ${cls}`;
    place(t, i); setVal(t, v);
    layer.append(t);
    return t;
  };
  function rebuild() {
    flush();
    layer.replaceChildren();
    tiles = new Map();
    game?.board.forEach((v, i) => { if (v) tiles.set(i, makeTile(i, v)); });
  }
  function flush() { if (pending) { clearTimeout(pending.timer); pending.finalize(); pending = null; } }

  function animate(r) {
    flush();
    const next = new Map(), dead = [], merged = new Set();
    for (const m of r.moves) {
      const t = tiles.get(m.from);
      if (!t) continue;
      place(t, m.to);
      if (next.has(m.to)) { dead.push(t); merged.add(m.to); } else next.set(m.to, t);
    }
    tiles = next;
    const board = r.state.board;
    const finalize = () => {
      for (const t of dead) t.remove();
      for (const i of merged) { const t = tiles.get(i); if (t) { setVal(t, board[i]); t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); } }
      if (r.spawn) tiles.set(r.spawn.i, makeTile(r.spawn.i, r.spawn.v, 'new'));
    };
    pending = { timer: setTimeout(() => { pending = null; finalize(); }, ANIM_MS), finalize };
  }

  function renderInfo() {
    const best = Math.max(serverBest, lsBest(), game?.score || 0);
    el('score').textContent = game?.score ?? 0;
    el('best').textContent = best;
    el('over').hidden = !game?.over;
    if (game?.over) el('overText').textContent = `Hết nước! ${game.score} điểm · ô lớn nhất ${maxTile(game.board)}`;
  }

  function draw3dSoon() {
    if (!view3d || drawTimer) return;
    drawTimer = setTimeout(() => { drawTimer = null; draw3d(); }, 250);
  }
  function draw3d() {
    if (!view3d || !game) return;
    const b = game.board.slice(), score = game.score;
    view3d.drawTable((c, w, h) => {
      const pad = 70, gap = 14, cs = (w - pad * 2 - gap * 5) / 4;
      c.fillStyle = '#bbada0'; roundRect(c, pad, pad, w - pad * 2, w - pad * 2, 24); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      b.forEach((v, i) => {
        const x = pad + gap + (i % 4) * (cs + gap), y = pad + gap + Math.floor(i / 4) * (cs + gap);
        c.fillStyle = v ? tileColor(v) : '#cdc1b4'; roundRect(c, x, y, cs, cs, 12); c.fill();
        if (!v) return;
        c.fillStyle = v <= 4 ? '#776e65' : '#f9f6f2';
        c.font = `bold ${v >= 1024 ? cs * 0.3 : v >= 128 ? cs * 0.38 : cs * 0.46}px Outfit, sans-serif`;
        c.fillText(String(v), x + cs / 2, y + cs / 2 + 4);
      });
      c.fillStyle = '#fff4dc'; c.font = 'bold 40px Outfit, sans-serif';
      c.fillText(`🔷 ${score} điểm`, w / 2, h - 30);
    });
  }

  // --- đi 1 nước ---
  function play(dir) {
    if (!game || game.over || starting) return;
    const now = performance.now();
    if (now - lastMoveAt < MIN_GAP_MS) return;
    const r = move(game, dir);
    if (!r.moved) return;
    lastMoveAt = now;
    game = r.state;
    animate(r);
    if (r.gained) sound.play(r.gained >= 128 ? 'correct' : 'pop');
    else sound.play('move');
    saveBest(game.score);
    if (game.over) setTimeout(() => sound.play('wrong'), 200);
    renderInfo();
    draw3dSoon();
    const expect = { moves: game.moves, score: game.score };
    inflight++;
    socket.emit('g2048:move', dir, (res) => {
      inflight = Math.max(0, inflight - 1);
      if (!res || res.resync || !res.ok || res.moves !== expect.moves || res.score !== expect.score) needSync = true;
      if (needSync && inflight === 0) { needSync = false; socket.emit('g2048:sync'); }
    });
  }

  function newGame() { starting = true; socket.emit('g2048:new'); }
  el('restart').onclick = newGame;
  el('again').onclick = newGame;

  // --- trạng thái riêng từ server ---
  const same = (a, b) => a && b && a.score === b.score && a.moves === b.moves && a.rng === b.rng && a.over === b.over && a.board.join() === b.board.join();
  const onState = (s) => {
    serverBest = Math.max(serverBest, s?.best || 0);
    const g = s?.game;
    if (!g || !Array.isArray(g.board)) {
      starting = false;
      if (!autoStarted) { autoStarted = true; newGame(); } // chưa có ván → tự mở ván mới (1 lần)
      return;
    }
    if (inflight > 0 && !starting) { needSync = true; return; } // còn nước đang bay → chờ rồi hỏi lại
    if (starting) { starting = false; sound.play('start'); }
    if (!same(game, g)) { game = { board: g.board.slice(), score: g.score, rng: g.rng, moves: g.moves, over: g.over }; rebuild(); }
    renderInfo();
    draw3d();
  };

  // --- bảng phòng ---
  const fillList = (ol, rows, fmt, empty) => {
    ol.replaceChildren();
    if (!rows.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = empty; ol.append(li); return; }
    for (const r of rows) {
      const li = document.createElement('li');
      const [a, b] = fmt(r);
      const n = document.createElement('span'); n.textContent = a;
      const v = document.createElement('b'); v.textContent = b;
      li.append(n, v);
      ol.append(li);
    }
  };
  const onRoom = (v) => {
    if (!v || !Array.isArray(v.players)) return;
    roomView = v;
    fillList(el('live'), v.players, (p) => [`${p.name}${p.id === store.selfId ? ' (bạn)' : ''}${p.over ? ' · hết nước' : ''}`, `${p.score} · ${p.max}`], 'Chưa ai chơi');
    fillList(el('top'), v.top || [], (t) => [t.name, String(t.score)], 'Chưa có ván nào kết thúc');
    view3d?.setPlayers(v.players.slice(0, 6).map((p) => p.id));
  };

  // --- điều khiển ---
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const dir = KEYS[e.code];
    if (!dir) return;
    e.preventDefault(); e.stopPropagation();
    play(dir);
  };
  const board = el('board');
  let touch = null;
  board.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  board.addEventListener('touchmove', (e) => { if (touch) e.preventDefault(); }, { passive: false });
  board.addEventListener('touchend', (e) => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  return {
    title: '🔷 2048',
    open(view) {
      view3d = view;
      root.hidden = false;
      socket.on('g2048:state', onState);
      socket.on('g2048:room', onRoom);
      window.addEventListener('keydown', onKey, true);
      socket.emit('g2048:sync');
      renderInfo();
    },
    close() {
      root.hidden = true;
      socket.off('g2048:state', onState);
      socket.off('g2048:room', onRoom);
      window.removeEventListener('keydown', onKey, true);
      flush();
      clearTimeout(drawTimer); drawTimer = null;
      view3d = null; game = null; roomView = null;
      inflight = 0; needSync = false; starting = false; autoStarted = false;
      layer.replaceChildren(); tiles = new Map();
    },
  };
}

const COLORS = { 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
const tileColor = (v) => COLORS[v] || '#3c3a32';
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
