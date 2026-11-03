import './styles/index.css';
import './styles/theme.css';
import { connect, socket } from './net/socket.js';
import { store, saved } from './store.js';
import { showCharacterCreate } from './ui/characterCreate.js';
import { initChat } from './ui/chat.js';
import { Engine } from './three/engine.js';
import { WorldView } from './three/worldView.js';
import { rtc } from './net/rtc.js';
import { initVideoGrid } from './ui/videoGrid.js';
import { sound } from './ui/sound.js';
import { createJoystick } from './ui/joystick.js';
import { initFishing } from './ui/fishing.js';
import { initPhoto } from './ui/photo.js';
import { initMinimap } from './ui/minimap.js';
import { initShrinePanel } from './ui/shrinePanel.js';
import { initEmotePanel } from './ui/emotePanel.js';
import { Q, PRESETS, isTouch, saveChoice, savedChoice } from './three/quality.js';
import { BUILDINGS } from './game/map.js';
import { ARCADE_GAMES, ARCADE_ID, gameById } from './game/arcade.js';
import { initArcadeHub } from './ui/arcadeHub.js';

const $ = (id) => document.getElementById(id);
const EMOJIS = ['😂', '❤️', '👍', '😮', '😢', '🔥'];

function toast(text, ms = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('toast-area').append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- 1. Mật khẩu ----------
async function login() {
  const form = $('login-form'), input = $('login-password'), err = $('login-error');
  const status = document.createElement('p');
  status.className = 'muted small';
  form.append(status);
  const tryConnect = async (pw) => {
    err.hidden = true;
    const btn = form.querySelector('button');
    btn.disabled = true;
    status.textContent = '⏳ Đang kết nối…';
    const slow = setTimeout(() => { status.textContent = '⏳ Server đang thức dậy (lần đầu có thể mất ~30–50 giây)…'; $('screen-login').hidden = false; }, 3000);
    try {
      await connect(pw);
      clearTimeout(slow); status.textContent = ''; btn.disabled = false;
      saved.setPassword(pw);
      return true;
    } catch (e) {
      clearTimeout(slow); status.textContent = ''; btn.disabled = false;
      err.textContent = e.message;
      err.hidden = false;
      return false;
    }
  };
  const remembered = saved.getPassword();
  if (remembered && (await tryConnect(remembered))) { $('screen-login').hidden = true; return; }
  if (remembered) err.hidden = true; // mật khẩu cũ hết hạn: không báo lỗi khi người dùng chưa gõ gì
  $('screen-login').hidden = false;
  input.focus();
  await new Promise((resolve) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (await tryConnect(input.value)) resolve();
    };
  });
  $('screen-login').hidden = true;
}

// ---------- 2. Thế giới 3D ----------
let engine = null;
let world = null;
let character = null;

function startWorld() {
  $('intro-bg')?.remove(); // cảnh nền màn đăng nhập không cần nữa
  $('game').hidden = false;
  $('hud').hidden = false;
  if (world) { world.setCharacter(character); return; }
  engine = new Engine($('game'));
  world = new WorldView(engine, character);
  engine.setView(world);
  window.__hq = { engine, world, store, socket }; // tiện debug trong console

  // Gợi ý điều khiển camera (hiện 1 lần)
  try {
    if (!localStorage.getItem('hoiquan.tip.camera')) {
      localStorage.setItem('hoiquan.tip.camera', '1');
      setTimeout(() => toast(isTouch() ? '👆 Vuốt màn hình để xoay camera · chụm 2 ngón để zoom' : '🖱️ Kéo chuột để xoay camera · lăn chuột để zoom', 6000), 1200);
    }
  } catch {}

  // Bong bóng chat & emoji hiện trên đầu nhân vật ở màn đang xem (sảnh hoặc phòng)
  socket.on('chat:message', (m) => { if (!m.system && m.id) engine.view?.bubble?.(m.id, m.text); });
  socket.on('emoji:show', ({ id, emoji }) => engine.view?.emoji?.(id, emoji));
  socket.on('emote:show', ({ id, type }) => engine.view?.emote?.(id, type));
  socket.on('fx:fireworks', ({ x, y }) => {
    world.fireworks(x, y);
    if (engine.view === world) [0, 450, 900].forEach((d) => setTimeout(() => sound.play('boom'), 800 + d));
  });
}

function setupHud() {
  // Thanh emoji
  const bar = $('emoji-bar');
  EMOJIS.forEach((e, i) => {
    const b = document.createElement('button');
    b.innerHTML = `${e}<small>${i + 1}</small>`;
    b.onclick = () => socket.emit('emoji:send', i);
    bar.append(b);
  });

  // Âm thanh
  const sb = $('btn-sound');
  const paintSound = () => { sb.textContent = sound.enabled ? '🔔' : '🔕'; };
  paintSound();
  sb.onclick = () => { sound.toggle(); paintSound(); };
  socket.on('chat:message', (m) => { if (!m.system && m.id !== store.selfId) sound.play('message'); });

  // Điện thoại: cần điều khiển ảo + nút emoji gọn
  if (isTouch()) {
    document.body.classList.add('touch');
    createJoystick((x, z) => {
      const c = engine?.view?.ctrl;
      if (c) c.analog = { x, z };
      if (x || z) store.emit('chat-collapse'); // đang đi thì thu chat lại, khỏi che nút
    });
  }
  // Hành động (nhảy, cúi chào…) – phím 7 8 9 0
  const sep = document.createElement('span'); sep.className = 'emoji-sep'; bar.append(sep);
  [['dance', '💃', 7], ['bow', '🙇', 8], ['wave', '👋', 9], ['spin', '🌀', 0]].forEach(([type, icon, key]) => {
    const b = document.createElement('button');
    b.innerHTML = `${icon}<small>${key}</small>`;
    b.title = { dance: 'Nhảy', bow: 'Cúi chào', wave: 'Vẫy tay', spin: 'Xoay vòng' }[type];
    b.onclick = () => socket.emit('emote:send', type);
    bar.append(b);
  });
  initEmotePanel(bar);
  store.on('toast', (t) => toast(t, 3000));

  $('btn-fireworks').onclick = () => socket.emit('fx:fireworks');
  // 📸 chụp ảnh (nút ở sảnh + trong phòng, phím P)
  const photo = initPhoto({ getEngine: () => engine, toast });
  $('btn-photo').onclick = $('btn-photo-room').onclick = () => photo.shoot();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && !e.repeat && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !e.ctrlKey && !e.metaKey) photo.shoot();
  });
  initMinimap({ getWorld: () => world });
  store.on('time', ({ text }) => { $('clock').textContent = `· ${text}`; });
  $('emoji-toggle').onclick = () => document.body.classList.toggle('emoji-open');
  bar.addEventListener('click', () => document.body.classList.remove('emoji-open'));

  // Chất lượng đồ họa (áp dụng sau khi tải lại trang)
  const qm = $('quality-menu');
  $('btn-quality').onclick = () => {
    const cur = savedChoice();
    qm.innerHTML = '<b>Đồ họa</b>';
    for (const [k, label] of [['auto', `Tự động (${PRESETS[Q.level].label})`], ['high', 'Cao'], ['medium', 'Trung bình'], ['low', 'Thấp – mượt nhất']]) {
      const b = document.createElement('button');
      b.className = `btn btn-sm ${cur === k ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = label;
      b.onclick = () => { if (k !== cur) { saveChoice(k); location.reload(); } else qm.hidden = true; };
      qm.append(b);
    }
    // 👑 admin
    const isAdmin = !!store.players.get(store.selfId)?.admin;
    const ab = document.createElement('button');
    ab.className = 'btn btn-sm btn-ghost admin-btn';
    ab.textContent = isAdmin ? '👑 Thoát chế độ admin' : '🔑 Đăng nhập admin';
    ab.onclick = () => {
      qm.hidden = true;
      if (isAdmin) { socket.emit('admin:logout'); toast('Đã thoát chế độ admin'); return; }
      const pw = prompt('Mật khẩu admin:');
      if (!pw) return;
      socket.emit('admin:login', pw, (r) => toast(r?.ok ? '👑 Bạn đã là admin – vào Sòng Bầu Cua để tặng điểm' : `🔒 ${r?.error || 'Không đăng nhập được'}`, 4000));
    };
    qm.append(document.createElement('hr'), ab);
    qm.hidden = !qm.hidden;
  };

  // Bấm vào gợi ý cũng vào phòng (cho điện thoại)
  $('interact-hint').onclick = () => world?.interact();

  // Số người online
  store.on('players-changed', () => { $('online-count').textContent = store.players.size; });

  // Gợi ý "Nhấn E": vào phòng / câu cá
  const fishing = initFishing();
  const hintState = { door: null, fish: false, wheel: false, wheelBusy: false, wheelDone: false, thing: null };
  const THING_VERB = { stand: 'đứng dậy', seat: 'ngồi xuống', critter: 'vuốt ve', tree: 'rung', kneel: 'quỳ lạy', altar: 'mở' };
  const touch = () => document.body.classList.contains('touch');
  // Nút tương tác tròn chỉ có biểu tượng (không có chữ để khỏi che màn hình điện thoại).
  // Mô tả đầy đủ nằm ở title / aria-label (rê chuột trên máy tính sẽ thấy).
  const THING_ICON = { stand: '🧍', seat: '🪑', kneel: '🧎', altar: '🙏' };
  const paintHint = () => {
    const hint = $('interact-hint'), b = hintState.door;
    let icon = '', label = '', busy = false, book = false;
    if (b) { icon = b.icon; label = `Vào ${b.name}`; }
    else if (hintState.wheel) { icon = '🎡'; busy = hintState.wheelBusy; label = busy ? 'Đang quay…' : `${hintState.wheelDone ? 'Quay tiếp' : 'Quay'} – Hôm nay ăn gì?`; }
    else if (hintState.thing) { const th = hintState.thing; icon = th.icon || THING_ICON[th.type] || '✋'; label = `${THING_VERB[th.type][0].toUpperCase()}${THING_VERB[th.type].slice(1)} ${th.type === 'stand' ? '' : th.label}`.trim(); }
    else if (hintState.fish) { icon = '🎣'; label = 'Câu cá'; book = true; }
    hint.hidden = !icon;
    if (!icon) return;
    const desc = touch() ? label : `${label} (phím E)`;
    hint.title = desc; hint.setAttribute('aria-label', desc); hint.dataset.label = label;
    hint.classList.toggle('busy', busy);
    hint.innerHTML = `<span class="ih-icon"></span>${touch() ? '' : '<kbd class="ih-key">E</kbd>'}${book ? '<button class="ih-extra" data-book title="Sổ tay câu cá" aria-label="Sổ tay câu cá">📖</button>' : ''}`;
    hint.querySelector('.ih-icon').textContent = icon;
    if (book) hint.querySelector('[data-book]').onclick = (e) => { e.stopPropagation(); fishing.openBook(); };
  };
  store.on('near-door', (b) => { hintState.door = b; paintHint(); });
  store.on('near-fish', (v) => { hintState.fish = v; paintHint(); });
  store.on('near-thing', (v) => { hintState.thing = v; paintHint(); });
  store.on('near-wheel', (v) => { hintState.wheel = v; paintHint(); });
  store.on('wheel-busy', (v) => { hintState.wheelBusy = v; if (!v) hintState.wheelDone = true; paintHint(); });

  initShrinePanel({ getWorld: () => world, toast });

  // 🎡 Thẻ kết quả vòng quay món ăn
  const wp = $('wheel-panel');
  let wpTimer = null;
  store.on('wheel-result', (f) => {
    clearTimeout(wpTimer);
    wp.innerHTML = '<div class="fish-icon"></div><div class="fish-info"><small></small><b></b><span class="tag"></span><p></p><button class="btn btn-primary btn-sm">🎡 Quay lại</button></div>';
    wp.querySelector('.fish-icon').textContent = f.icon;
    wp.querySelector('small').textContent = `${f.by ?? 'Ai đó'} quay trúng:`;
    wp.querySelector('b').textContent = f.name;
    wp.querySelector('.tag').textContent = f.region;
    wp.querySelector('p').textContent = f.desc;
    wp.querySelector('button').onclick = () => { wp.hidden = true; world?.spinWheel(); };
    wp.hidden = false;
    wpTimer = setTimeout(() => { wp.hidden = true; }, 9000);
  });
  store.on('wheel-spin', () => { wp.hidden = true; });

  // Đổi nhân vật
  $('btn-edit-char').onclick = async () => {
    if (store.room !== 'lobby') return;
    $('hud').hidden = true;
    $('game').hidden = true;
    world.deactivate();
    const c = await showCharacterCreate(character);
    character = { ...character, ...c };
    saved.setCharacter(character);
    startWorld();
    world.activate();
    socket.disconnect().connect(); // vào lại với ngoại hình mới
  };
}

// ---------- 3. Phòng ----------
/** Điện thoại: bảng bên phải biến thành tấm trượt từ dưới lên, có tay nắm để mở/đóng. */
function addSheetHandle(id) {
  const side = document.querySelector(`#room-${id} .game-side, #room-${id} .cinema-side`);
  if (!side || side.querySelector('.sheet-handle')) return;
  const h = document.createElement('button');
  h.type = 'button';
  h.className = 'sheet-handle';
  h.innerHTML = '<i></i><span>Bảng điều khiển</span>';
  h.onclick = () => document.body.classList.toggle('sheet-open', side.classList.toggle('open'));
  side.prepend(h);
}

/**
 * Mỗi phòng = giao diện (ui) + cảnh 3D (view), đều TẢI KHI CẦN: trang đầu chỉ tải sảnh,
 * vào phòng nào mới tải code phòng đó (đi tới gần cửa là tải trước cho nhanh).
 */
const ROOM_DEFS = {
  cinema: { ui: () => import('./rooms/cinema.js').then((m) => m.createCinemaRoom()), view: () => import('./three/rooms/cinema3d.js').then((m) => m.CinemaView) },
  caro: { ui: () => import('./rooms/caro.js').then((m) => m.createCaroRoom()), view: () => import('./three/rooms/caro3d.js').then((m) => m.CaroView) },
  draw: { ui: () => import('./rooms/drawGuess.js').then((m) => m.createDrawRoom()), view: () => import('./three/rooms/draw3d.js').then((m) => m.DrawView) },
  quiz: { ui: () => import('./rooms/quiz.js').then((m) => m.createQuizRoom()), view: () => import('./three/rooms/quiz3d.js').then((m) => m.QuizView) },
  gallery: { ui: () => import('./rooms/gallery.js').then((m) => m.createGalleryRoom()), view: () => import('./three/rooms/gallery3d.js').then((m) => m.GalleryView) },
  typing: { ui: () => import('./rooms/typing.js').then((m) => m.createTypingRoom()), view: () => import('./three/rooms/typing3d.js').then((m) => m.TypingView) },
  baucua: { ui: () => import('./rooms/baucua.js').then((m) => m.createBauCuaRoom()), view: () => import('./three/rooms/baucua3d.js').then((m) => m.BauCuaView) },
};
// 🕹️ Các phòng trong Khu Trò Chơi dùng chung 1 cảnh 3D
const arcadeUI = import.meta.glob('./rooms/arcade/*.js');
for (const g of ARCADE_GAMES) {
  const load = arcadeUI[`./rooms/arcade/${g.id}.js`];
  if (!load) continue;
  ROOM_DEFS[g.id] = { ui: () => load().then((m) => m.createRoom()), view: () => import('./three/rooms/arcade3d.js').then((m) => m.ArcadeView), arcade: true };
}

function setupRooms() {
  const rooms = {};   // id -> giao diện đã tạo
  const VIEW = {};    // id -> lớp cảnh 3D đã tải
  const loading = {}; // id -> promise đang tải
  /** Tải (1 lần) giao diện + cảnh 3D của phòng. */
  const ensureRoom = (id) => (loading[id] ||= (async () => {
    const def = ROOM_DEFS[id];
    if (!document.getElementById(`room-${id}`)) { // phòng mới: tự thêm khung <section>
      const sec = document.createElement('section');
      sec.id = `room-${id}`; sec.className = 'room'; sec.hidden = true;
      document.getElementById('room-baucua').after(sec);
    }
    const [ui, View] = await Promise.all([def.ui(), def.view()]);
    rooms[id] = ui; VIEW[id] = View;
  })().catch((e) => { delete loading[id]; throw e; }));

  // Đi tới gần cửa → tải trước phòng đó (Khu Trò Chơi: tải trước cảnh 3D chung)
  store.on('near-door', (b) => {
    if (!b) return;
    if (b.id === ARCADE_ID) import('./three/rooms/arcade3d.js').catch(() => {});
    else if (ROOM_DEFS[b.id]) ensureRoom(b.id).catch(() => {});
  });
  const hub = initArcadeHub({ onPick: (id) => store.emit('enter-room', id) });

  // 🤖 Bot chỉ vào khi được mời
  const BOT_ROOMS = ['caro', 'draw', 'quiz', 'typing', 'baucua', ...ARCADE_GAMES.filter((g) => g.bot).map((g) => g.id)];
  const botBtn = $('btn-bot');
  const paintBot = () => {
    const room = store.room;
    botBtn.hidden = !BOT_ROOMS.includes(room);
    const has = store.inRoom(room).some((p) => p.bot);
    const narrow = matchMedia('(max-width: 700px)').matches; // điện thoại: nút gọn để chừa chỗ cho ô video
    botBtn.textContent = has ? (narrow ? '🤖✕' : '🤖 Mời bot ra') : (narrow ? '🤖＋' : '🤖 Chơi với bot');
    botBtn.title = has ? 'Mời bot ra' : 'Chơi với bot';
    botBtn.classList.toggle('btn-primary', !has);
    botBtn.classList.toggle('btn-ghost', has);
  };
  botBtn.onclick = () => socket.emit(store.inRoom(store.room).some((p) => p.bot) ? 'bot:remove' : 'bot:add');
  store.on('players-changed', paintBot);
  const views = {};

  const leave = () => {
    const id = store.room;
    if (id === 'lobby') return;
    rooms[id]?.close();
    engine.setView(world);
    rtc.leave();
    store.room = 'lobby';
    socket.emit('world:setRoom', 'lobby');
    document.body.classList.remove('in-room');
    delete document.body.dataset.room;
    document.body.classList.remove('sheet-open');
    document.querySelectorAll('.room .open').forEach((el) => el.classList.remove('open'));
    $('room-bar').hidden = true;
    $('hud').hidden = false;
    world.placeAtDoor(gameById(id) ? ARCADE_ID : id); // rời game nhỏ → đứng trước cửa Khu Trò Chơi
    sound.play('leave');
  };

  let entering = null;
  store.on('enter-room', async (id) => {
    if (id === ARCADE_ID) { if (store.room === 'lobby') hub.open(); return; }
    if (!ROOM_DEFS[id] || store.room !== 'lobby' || entering) return;
    entering = id;
    const slow = setTimeout(() => toast('⏳ Đang tải phòng…', 1500), 350);
    try { await ensureRoom(id); }
    catch (e) { console.warn('[room]', e); toast('Không tải được phòng – kiểm tra mạng rồi thử lại nhé'); return; }
    finally { clearTimeout(slow); entering = null; }
    if (store.room !== 'lobby') return;
    store.room = id;
    socket.emit('world:setRoom', id);
    $('hud').hidden = true;
    $('interact-hint').hidden = true;
    $('room-title').textContent = rooms[id].title;
    $('room-bar').hidden = false;
    document.body.classList.add('in-room');
    document.body.dataset.room = id;
    addSheetHandle(id);
    views[id] ||= new VIEW[id](engine, id);
    rooms[id].open(views[id]);
    engine.setView(views[id]);
    paintBot();
    rtc.join(id);
    sound.play('enter');
  });

  $('btn-leave').onclick = leave;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || store.room === 'lobby' || document.fullscreenElement) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    leave();
  });
  // Mất kết nối rồi vào lại: server coi như mới ở lobby → đóng phòng cho khớp
  socket.on('disconnect', () => { if (store.room !== 'lobby') { leave(); toast('Mất kết nối – đang kết nối lại…'); } });
  initVideoGrid();
}

// ---------- Khởi động ----------
(async function boot() {
  await login();
  character = saved.getCharacter();
  if (!character?.name) {
    character = await showCharacterCreate(null);
    saved.setCharacter(character);
  }
  // Lưu vị trí định kỳ để lần sau vào đúng chỗ
  setInterval(() => saved.setCharacter(character), 5000);
  initChat();
  setupHud();
  setupRooms();
  startWorld();
})();
