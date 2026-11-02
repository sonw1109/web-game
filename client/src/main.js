import './styles/index.css';
import { connect, socket } from './net/socket.js';
import { store, saved } from './store.js';
import { showCharacterCreate } from './ui/characterCreate.js';
import { initChat } from './ui/chat.js';
import { Engine } from './three/engine.js';
import { WorldView } from './three/worldView.js';
import { CinemaView } from './three/rooms/cinema3d.js';
import { CaroView } from './three/rooms/caro3d.js';
import { QuizView } from './three/rooms/quiz3d.js';
import { DrawView } from './three/rooms/draw3d.js';
import { GalleryView } from './three/rooms/gallery3d.js';
import { createCinemaRoom } from './rooms/cinema.js';
import { createCaroRoom } from './rooms/caro.js';
import { createDrawRoom } from './rooms/drawGuess.js';
import { createQuizRoom } from './rooms/quiz.js';
import { createGalleryRoom } from './rooms/gallery.js';
import { rtc } from './net/rtc.js';
import { initVideoGrid } from './ui/videoGrid.js';
import { sound } from './ui/sound.js';
import { createJoystick } from './ui/joystick.js';
import { Q, PRESETS, isTouch, saveChoice, savedChoice } from './three/quality.js';
import { BUILDINGS } from './game/map.js';

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
    createJoystick((x, z) => { const c = engine?.view?.ctrl; if (c) c.analog = { x, z }; });
  }
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
    qm.hidden = !qm.hidden;
  };

  // Bấm vào gợi ý cũng vào phòng (cho điện thoại)
  $('interact-hint').onclick = () => {
    const b = world?.nearDoor;
    if (b) store.emit('enter-room', b.id);
  };

  // Số người online
  store.on('players-changed', () => { $('online-count').textContent = store.players.size; });

  // Gợi ý "Nhấn E"
  store.on('near-door', (b) => {
    const hint = $('interact-hint');
    if (!b) { hint.hidden = true; return; }
    hint.innerHTML = document.body.classList.contains('touch') ? `👆 Chạm để vào ${b.icon} <b></b>` : `Nhấn <kbd>E</kbd> để vào ${b.icon} <b></b>`;
    hint.querySelector('b').textContent = b.name;
    hint.hidden = false;
  });

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

function setupRooms() {
  const rooms = {
    cinema: createCinemaRoom(),
    caro: createCaroRoom(),
    draw: createDrawRoom(),
    quiz: createQuizRoom(),
    gallery: createGalleryRoom(),
  };
  // Cảnh 3D của từng phòng: dựng lần đầu khi vào, giữ lại cho lần sau
  const VIEW = { cinema: CinemaView, caro: CaroView, draw: DrawView, quiz: QuizView, gallery: GalleryView };
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
    world.placeAtDoor(id);
    sound.play('leave');
  };

  store.on('enter-room', (id) => {
    if (!rooms[id] || store.room !== 'lobby') return;
    store.room = id;
    socket.emit('world:setRoom', id);
    $('hud').hidden = true;
    $('interact-hint').hidden = true;
    $('room-title').textContent = rooms[id].title;
    $('room-bar').hidden = false;
    document.body.classList.add('in-room');
    document.body.dataset.room = id;
    addSheetHandle(id);
    views[id] ||= new VIEW[id](engine);
    rooms[id].open(views[id]);
    engine.setView(views[id]);
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
