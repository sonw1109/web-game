// 🎨 Vẽ & Đoán – UI. Tọa độ nét vẽ chuẩn hóa 0..1000 để mọi màn hình như nhau.
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from '../ui/sound.js';

const COLORS = ['#1b1b1f', '#ffffff', '#e03131', '#f76707', '#fcc419', '#37b24d', '#1c7ed6', '#7048e8', '#e64980', '#8b5a2b', '#868e96', '#99e9f2'];
const SIZES = [3, 8, 18];
const ASPECT = 4 / 3;

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="draw-top">
      <span class="pill" data-el="round"></span>
      <div class="hint pixel" data-el="hint"></div>
      <span class="pill timer-pill" data-el="time"></span>
    </div>
    <div class="canvas-wrap" data-el="wrap">
      <canvas data-el="canvas" width="1000" height="750"></canvas>
      <div class="draw-overlay" data-el="overlay" hidden></div>
    </div>
    <div class="draw-tools" data-el="tools">
      <div class="colors" data-el="colors"></div>
      <div class="sizes" data-el="sizes"></div>
      <button class="btn btn-icon" data-tool="eraser" title="Tẩy">🧽</button>
      <button class="btn btn-icon" data-tool="undo" title="Hoàn tác (Ctrl+Z)">↶</button>
      <button class="btn btn-icon" data-tool="clear" title="Xóa hết">🗑️</button>
    </div>
  </div>
  <aside class="game-side">
    <h3>Bảng điểm</h3>
    <ol class="scoreboard" data-el="scores"></ol>
    <button class="btn btn-ghost btn-sm restart-btn" data-el="restart" hidden>🔄 Chơi ván mới</button>
    <p class="muted small">💬 Gõ đáp án vào ô chat bên dưới (không cần dấu).</p>
  </aside>
</div>`;

export function createDrawRoom() {
  const root = document.getElementById('room-draw');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  const canvas = el('canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  let state = null, receivedAt = 0, secret = { word: '', choices: [] }, timer = null;
  let strokes = [];               // [{sid,c,s,pts}]
  let color = COLORS[0], size = SIZES[1], eraser = false;
  let drawing = null;             // nét đang vẽ của mình
  let pending = [];               // điểm chờ gửi
  let sendTimer = null;

  const amDrawer = () => state?.phase === 'drawing' && state.drawerId === store.selfId;
  let view3d = null;
  const dirty = () => view3d?.markDirty();

  // ---------- Vẽ ----------
  const toCanvas = (v, axis) => (axis ? v * H / 1000 : v * W / 1000);
  function drawSegment(st, from) {
    const p = st.pts;
    if (p.length < 2) return;
    ctx.strokeStyle = st.c; ctx.fillStyle = st.c;
    ctx.lineWidth = st.s * W / 1000 * 1.6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const start = Math.max(0, from - 2);
    if (p.length === 2 || (start === 0 && p.length <= 4)) {
      ctx.beginPath(); ctx.arc(toCanvas(p[0], 0), toCanvas(p[1], 1), ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(toCanvas(p[start], 0), toCanvas(p[start + 1], 1));
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(toCanvas(p[i], 0), toCanvas(p[i + 1], 1));
    ctx.stroke();
    dirty();
  }
  function redraw() {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    for (const st of strokes) drawSegment(st, 0);
    dirty();
  }
  function appendStroke({ sid, c, s, pts }) {
    let st = strokes[strokes.length - 1];
    if (!st || st.sid !== sid) { st = { sid, c, s, pts: [] }; strokes.push(st); }
    const from = st.pts.length;
    st.pts.push(...pts);
    drawSegment(st, from);
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const flush = () => {
    if (!drawing || !pending.length) return;
    socket.emit('draw:stroke', { sid: drawing.sid, c: drawing.c, s: drawing.s, pts: pending });
    pending = [];
  };
  // p = [x, y] chuẩn hóa 0..1000 – nguồn có thể là canvas HTML hoặc giá vẽ 3D
  function startStroke(p) {
    if (!amDrawer()) return;
    const sid = Math.random().toString(36).slice(2, 10);
    drawing = { sid, c: eraser ? '#ffffff' : color, s: eraser ? size * 2 : size };
    appendStroke({ ...drawing, pts: p });
    pending = [...p];
    clearInterval(sendTimer);
    sendTimer = setInterval(flush, 50);
  }
  function moveStroke(p) {
    if (!drawing) return;
    const st = strokes[strokes.length - 1];
    const lx = st.pts[st.pts.length - 2], ly = st.pts[st.pts.length - 1];
    if (Math.abs(p[0] - lx) + Math.abs(p[1] - ly) < 3) return;
    appendStroke({ ...drawing, pts: p });
    pending.push(...p);
    if (pending.length > 300) flush();
  }
  canvas.addEventListener('pointerdown', (e) => { if (amDrawer()) { canvas.setPointerCapture(e.pointerId); startStroke(pos(e)); } });
  canvas.addEventListener('pointermove', (e) => moveStroke(pos(e)));
  const endStroke = () => { if (!drawing) return; flush(); clearInterval(sendTimer); drawing = null; };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // ---------- Công cụ ----------
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.style.background = c; b.title = c;
    b.onclick = () => { color = c; eraser = false; renderTools(); };
    el('colors').append(b);
  });
  SIZES.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'size-btn'; b.innerHTML = `<i style="width:${s + 4}px;height:${s + 4}px"></i>`;
    b.onclick = () => { size = s; renderTools(); };
    el('sizes').append(b);
  });
  el('restart').onclick = () => { if (confirm('Hủy ván đang chơi và bắt đầu ván mới?')) socket.emit('draw:restart'); };
  root.querySelector('[data-tool=eraser]').onclick = () => { eraser = !eraser; renderTools(); };
  root.querySelector('[data-tool=undo]').onclick = () => socket.emit('draw:undo');
  root.querySelector('[data-tool=clear]').onclick = () => { if (confirm('Xóa hết bản vẽ?')) socket.emit('draw:clear'); };
  function renderTools() {
    [...el('colors').children].forEach((b, i) => b.classList.toggle('active', !eraser && COLORS[i] === color));
    [...el('sizes').children].forEach((b, i) => b.classList.toggle('active', SIZES[i] === size));
    root.querySelector('[data-tool=eraser]').classList.toggle('active', eraser);
    el('tools').classList.toggle('disabled', !amDrawer());
    canvas.classList.toggle('can-draw', amDrawer());
  }
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && amDrawer()) { e.preventDefault(); socket.emit('draw:undo'); }
  };

  // ---------- Kích thước canvas giữ tỉ lệ 4:3 ----------
  const fit = () => {
    const wrap = el('wrap');
    const maxW = wrap.parentElement.clientWidth, maxH = wrap.parentElement.clientHeight - 120;
    const w = Math.max(240, Math.min(maxW, maxH * ASPECT));
    wrap.style.width = `${w}px`; wrap.style.height = `${w / ASPECT}px`;
  };
  const ro = new ResizeObserver(fit);

  // ---------- Hiển thị trạng thái ----------
  function renderOverlay() {
    const ov = el('overlay');
    ov.replaceChildren();
    const s = state;
    const h = (tag, text, cls) => { const x = document.createElement(tag); x.textContent = text; if (cls) x.className = cls; ov.append(x); return x; };
    const startBtn = (label) => {
      const b = h('button', label, 'btn btn-primary');
      b.onclick = () => socket.emit('draw:start');
      if (s.players.length < 2) { b.disabled = true; h('p', 'Cần ít nhất 2 người – rủ bạn vào hoặc bấm 🤖 Chơi với bot ở trên', 'muted'); }
    };
    let show = true;
    if (s.phase === 'idle') {
      h('div', '🎨', 'big'); h('h2', 'Vẽ & Đoán', 'pixel');
      h('p', 'Mỗi người lần lượt vẽ, những người khác gõ đáp án vào ô chat. Đoán càng nhanh càng nhiều điểm!', 'muted');
      startBtn('Bắt đầu ván mới');
    } else if (s.phase === 'choosing') {
      if (s.drawerId === store.selfId) {
        h('h2', 'Chọn một từ để vẽ', 'pixel');
        const row = document.createElement('div'); row.className = 'choices'; ov.append(row);
        secret.choices.forEach((w, i) => {
          const b = document.createElement('button'); b.className = 'btn btn-ghost'; b.textContent = w;
          b.onclick = () => socket.emit('draw:choose', i);
          row.append(b);
        });
      } else {
        h('div', '🤔', 'big'); h('p', `${s.drawerName} đang chọn từ…`);
      }
    } else if (s.phase === 'roundEnd') {
      h('p', 'Từ khóa là', 'muted'); h('h2', s.word, 'pixel reveal-word');
    } else if (s.phase === 'gameOver') {
      h('h2', '🏆 Kết quả', 'pixel');
      const ol = document.createElement('ol'); ol.className = 'final';
      (s.result || []).forEach((r, i) => {
        const li = document.createElement('li');
        li.textContent = `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${r.name} – ${r.score} điểm`;
        ol.append(li);
      });
      ov.append(ol);
      startBtn('Chơi ván nữa');
    } else show = false;
    ov.hidden = !show;
  }

  function render() {
    if (!state) return;
    const s = state;
    el('round').textContent = s.turns ? `Lượt ${Math.min(s.turn, s.turns)}/${s.turns}` : 'Phòng Vẽ';
    if (s.phase === 'drawing') {
      el('hint').textContent = amDrawer() ? `Vẽ: ${secret.word}` : s.hint;
      el('hint').classList.toggle('mine', amDrawer());
    } else el('hint').textContent = s.phase === 'idle' ? '' : s.drawerName ? `✏️ ${s.drawerName}` : '';

    const ol = el('scores');
    ol.replaceChildren();
    for (const p of s.players) {
      const li = document.createElement('li');
      li.className = `${p.guessed ? 'guessed' : ''}${p.id === s.drawerId ? ' drawer' : ''}${p.id === store.selfId ? ' me' : ''}`;
      const n = document.createElement('span'); n.textContent = `${p.id === s.drawerId ? '✏️ ' : p.guessed ? '✅ ' : ''}${p.name}`;
      const sc = document.createElement('b'); sc.textContent = p.score;
      li.append(n, sc);
      ol.append(li);
    }
    el('restart').hidden = s.phase === 'idle' || s.phase === 'gameOver';
    renderOverlay();
    renderTools();
    view3d?.setDrawer(['choosing', 'drawing'].includes(s.phase) ? s.drawerId : null);
  }

  function tickTimer() {
    if (!state || !['choosing', 'drawing', 'roundEnd'].includes(state.phase)) { el('time').textContent = '⏱ –'; return; }
    const left = Math.max(0, Math.ceil((state.remainingMs - (Date.now() - receivedAt)) / 1000));
    el('time').textContent = `⏱ ${left}s`;
    el('time').classList.toggle('low', state.phase === 'drawing' && left <= 10);
  }

  // ---------- Socket ----------
  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (prev?.phase !== s.phase) {
      if (s.phase === 'drawing' && s.drawerId === store.selfId) sound.play('start');
      if (s.phase === 'gameOver') sound.play('win');
    }
    render();
  };
  const onSecret = (d) => { secret = d; render(); };
  const onCorrect = ({ id }) => sound.play(id === store.selfId ? 'correct' : 'pop');
  const onStroke = (d) => appendStroke(d);
  const onRedraw = (list) => { strokes = list.map((s) => ({ ...s, pts: [...s.pts] })); redraw(); };

  return {
    title: '🎨 Phòng Vẽ',
    open(view) {
      if (view && view3d !== view) {
        view.attachCanvas(canvas, {
          canDraw: amDrawer,
          onPointer: (type, u, v) => {
            const p = [Math.round(u * 1000), Math.round(v * 1000)];
            if (type === 'down') startStroke(p); else if (type === 'move') moveStroke(p); else endStroke();
          },
        });
      }
      view3d = view;
      root.hidden = false;
      document.body.classList.add('draw-room');
      socket.on('draw:state', onState);
      socket.on('draw:secret', onSecret);
      socket.on('draw:correct', onCorrect);
      socket.on('draw:stroke', onStroke);
      socket.on('draw:redraw', onRedraw);
      window.addEventListener('keydown', onKey);
      ro.observe(root.querySelector('.game-main'));
      redraw();
      socket.emit('draw:sync');
      timer = setInterval(tickTimer, 250);
    },
    close() {
      root.hidden = true;
      document.body.classList.remove('draw-room');
      endStroke();
      socket.off('draw:state', onState);
      socket.off('draw:secret', onSecret);
      socket.off('draw:correct', onCorrect);
      socket.off('draw:stroke', onStroke);
      socket.off('draw:redraw', onRedraw);
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      clearInterval(timer);
      state = null; secret = { word: '', choices: [] };
    },
  };
}
