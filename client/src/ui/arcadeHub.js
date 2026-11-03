// 🕹️ Sảnh Khu Trò Chơi: chọn game (có số người đang chơi trực tiếp) + Bảng Vàng điểm cao.
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from './sound.js';
import { ARCADE_GAMES } from '../game/arcade.js';
import '../styles/arcade.css';

export function initArcadeHub({ onPick }) {
  const modal = document.createElement('div');
  modal.id = 'arcade-hub';
  modal.className = 'modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card glass hub-card" role="dialog" aria-label="Khu Trò Chơi">
      <header>
        <h2 class="pixel">🕹️ Khu Trò Chơi</h2>
        <div class="hub-tabs" role="tablist">
          <button class="btn btn-sm btn-primary" data-tab="games">🎮 Trò chơi</button>
          <button class="btn btn-sm btn-ghost" data-tab="top">🏆 Bảng Vàng</button>
        </div>
        <button class="btn btn-icon" data-close aria-label="Đóng">✕</button>
      </header>
      <div class="hub-body" data-pane="games"></div>
      <div class="hub-body hub-top" data-pane="top" hidden>
        <div class="hub-top-filter"></div>
        <ol class="hub-top-list"></ol>
      </div>
    </div>`;
  document.body.append(modal);
  const $ = (s) => modal.querySelector(s);
  const pane = (n) => modal.querySelector(`[data-pane="${n}"]`);

  // ---- Danh sách game, chia nhóm ----
  const counts = new Map();
  const cats = [...new Set(ARCADE_GAMES.map((g) => g.cat))];
  for (const cat of cats) {
    const h = document.createElement('h3'); h.className = 'hub-cat'; h.textContent = cat;
    const grid = document.createElement('div'); grid.className = 'hub-grid';
    for (const g of ARCADE_GAMES.filter((x) => x.cat === cat)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'hub-game';
      card.style.setProperty('--c', g.color);
      card.innerHTML = '<span class="hg-icon"></span><span class="hg-text"><b></b><small></small><em></em></span><span class="hg-live"></span>';
      card.querySelector('.hg-icon').textContent = g.icon;
      card.querySelector('b').textContent = g.name;
      card.querySelector('small').textContent = g.desc;
      card.querySelector('em').textContent = `👥 ${g.players}${g.bot ? ' · 🤖 có bot' : ''}`;
      card.onclick = () => { close(); onPick(g.id); };
      counts.set(g.id, card.querySelector('.hg-live'));
      grid.append(card);
    }
    pane('games').append(h, grid);
  }
  const paintCounts = () => {
    if (modal.hidden) return;
    for (const [id, el] of counts) {
      const n = store.inRoom(id).filter((p) => !p.bot).length;
      el.textContent = n ? `🟢 ${n} đang chơi` : '';
      el.hidden = !n;
    }
  };
  store.on('players-changed', paintCounts);

  // ---- Bảng Vàng ----
  let topGame = 'all';
  const filter = $('.hub-top-filter');
  for (const g of [{ id: 'all', icon: '⭐', name: 'Tổng' }, ...ARCADE_GAMES]) {
    const b = document.createElement('button');
    b.className = 'btn btn-sm btn-ghost'; b.dataset.g = g.id; b.textContent = `${g.icon} ${g.name}`;
    b.onclick = () => { topGame = g.id; loadTop(); };
    filter.append(b);
  }
  function loadTop() {
    for (const b of filter.children) b.classList.toggle('btn-primary', b.dataset.g === topGame);
    const list = $('.hub-top-list');
    list.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: '⏳ Đang tải…' }));
    socket.emit('arcade:top', topGame, (res) => {
      list.replaceChildren();
      if (!res?.top?.length) { list.append(Object.assign(document.createElement('li'), { className: 'muted', textContent: res?.error || 'Chưa có ai lên bảng – vào chơi ngay nào!' })); return; }
      const best = res.game === 'g2048';
      res.top.forEach((r, i) => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="ht-rank"></span><span class="ht-name"></span><span class="ht-pts"></span>';
        li.querySelector('.ht-rank').textContent = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
        li.querySelector('.ht-name').textContent = r.name;
        li.querySelector('.ht-pts').textContent = best ? `${r.best.toLocaleString('vi')} điểm kỷ lục` : `${r.pts.toLocaleString('vi')} điểm${r.wins ? ` · ${r.wins} thắng` : ''}`;
        if (r.name === store.players.get(store.selfId)?.name) li.classList.add('me');
        list.append(li);
      });
    });
  }

  // ---- Tab / mở / đóng ----
  const tab = (n) => {
    for (const b of modal.querySelectorAll('[data-tab]')) { b.classList.toggle('btn-primary', b.dataset.tab === n); b.classList.toggle('btn-ghost', b.dataset.tab !== n); }
    pane('games').hidden = n !== 'games';
    pane('top').hidden = n !== 'top';
    if (n === 'top') loadTop();
  };
  for (const b of modal.querySelectorAll('[data-tab]')) b.onclick = () => tab(b.dataset.tab);
  function open() {
    if (!modal.hidden) return;
    modal.hidden = false;
    tab('games');
    paintCounts();
    sound.play('enter');
  }
  function close() { modal.hidden = true; }
  $('[data-close]').onclick = close;
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { e.stopImmediatePropagation(); close(); } }, true);
  // đi khỏi cửa / vào phòng khác → đóng
  store.on('near-door', (b) => { if (b?.id !== 'arcade') close(); });

  return { open, close, get isOpen() { return !modal.hidden; } };
}
