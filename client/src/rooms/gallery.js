// 🖼️ Phòng Tranh – treo ảnh, thả tim, 6 chế độ đèn đồng bộ cả phòng.
import { socket } from '../net/socket.js';
import { store, saved } from '../store.js';
import { sound } from '../ui/sound.js';

const LIGHTS = [
  { id: 'museum', icon: '🏛️', name: 'Bảo tàng' },
  { id: 'neon', icon: '💜', name: 'Neon' },
  { id: 'disco', icon: '🪩', name: 'Disco' },
  { id: 'sunset', icon: '🌇', name: 'Hoàng hôn' },
  { id: 'stars', icon: '🌌', name: 'Sao đêm' },
  { id: 'dark', icon: '🔦', name: 'Tắt đèn' },
];
const MAX_EDGE = 1920;
const MAX_BYTES = 4 * 1024 * 1024;

const TEMPLATE = `
<div class="game-layout">
  <div class="gallery-hall" data-el="hall" data-light="museum">
    <div class="fx fx-ambient"></div>
    <div class="fx fx-beams"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="fx fx-stars" data-el="stars"></div>
    <div class="mirror-ball"></div>
    <div class="gallery-scroll" data-el="scroll">
      <div class="wall" data-el="wall"></div>
      <div class="gallery-empty" data-el="empty">
        <div class="big">🖼️</div>
        <p>Phòng còn trống. Treo bức ảnh đầu tiên ở cột bên phải,<br/>hoặc kéo-thả ảnh vào đây!</p>
      </div>
    </div>
    <div class="floor"></div>
    <div class="fx fx-dark"></div>
    <div class="dark-hint">🔦 Di chuột để soi đèn pin</div>
    <div class="drop-hint">📥 Thả ảnh vào đây để treo lên tường</div>
  </div>
  <aside class="game-side">
    <h3>Đèn trong phòng</h3>
    <div class="light-grid" data-el="lights"></div>
    <p class="muted small">Đổi đèn là cả phòng cùng thấy.</p>
    <h3>Treo ảnh</h3>
    <div class="upload-box">
      <input data-el="caption" maxlength="120" placeholder="Chú thích (không bắt buộc)" />
      <label class="btn btn-primary btn-sm upload-btn">📤 Chọn ảnh…
        <input type="file" data-el="file" accept="image/*" multiple hidden />
      </label>
      <p class="muted small" data-el="progress"></p>
      <p class="error" data-el="error" hidden></p>
    </div>
    <p class="muted small" data-el="count"></p>
  </aside>
</div>
<div class="lightbox" data-el="lightbox" hidden>
  <button class="lb-close btn btn-icon" data-act="close" title="Đóng (Esc)">✕</button>
  <button class="lb-nav lb-prev" data-act="prev" title="Ảnh trước (←)">‹</button>
  <figure class="lb-figure">
    <img data-el="lbImg" alt="" />
    <figcaption>
      <div class="lb-cap" data-el="lbCap"></div>
      <div class="lb-meta" data-el="lbMeta"></div>
      <div class="lb-actions">
        <button class="btn btn-ghost btn-sm" data-act="like" data-el="lbLike">🤍</button>
        <button class="btn btn-ghost btn-sm" data-act="slide" data-el="lbSlide">▶ Trình chiếu</button>
        <a class="btn btn-ghost btn-sm" data-el="lbDownload" download>⬇ Tải về</a>
        <button class="btn btn-ghost btn-sm" data-act="delete">🗑️ Gỡ ảnh</button>
      </div>
    </figcaption>
  </figure>
  <button class="lb-nav lb-next" data-act="next" title="Ảnh sau (→)">›</button>
</div>`;

/** Thu nhỏ ảnh về tối đa MAX_EDGE px, xuất JPEG. GIF giữ nguyên để còn chuyển động. */
async function prepareImage(file) {
  if (file.type === 'image/gif' && file.size <= MAX_BYTES) {
    const bmp = await createImageBitmap(file);
    return { blob: file, w: bmp.width, h: bmp.height };
  }
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // ảnh PNG trong suốt → nền trắng
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
  return { blob, w, h };
}

export function createGalleryRoom() {
  const root = document.getElementById('room-gallery');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  const hall = el('hall');
  // Lightbox phải nằm ngay dưới <body>, nếu không sẽ bị thanh phòng/ô chat đè (stacking context của .room)
  const lightbox = el('lightbox');
  document.body.append(lightbox);
  const lbEl = (n) => lightbox.querySelector(`[data-el="${n}"]`);
  let state = { light: 'museum', photos: [] };
  let lbIndex = -1, slideTimer = null;
  const myName = () => store.players.get(store.selfId)?.name;

  // ---------- Bầu trời sao (tạo 1 lần) ----------
  const stars = [];
  for (let i = 0; i < 160; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 4}s`;
    s.style.setProperty('--sz', `${Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1}px`);
    stars.push(s);
  }
  el('stars').append(...stars);

  // ---------- Nút đèn ----------
  for (const L of LIGHTS) {
    const b = document.createElement('button');
    b.className = 'light-btn'; b.dataset.light = L.id;
    b.innerHTML = `<span class="ic">${L.icon}</span><span>${L.name}</span>`;
    b.onclick = () => socket.emit('gallery:light', L.id);
    el('lights').append(b);
  }

  // ---------- Đèn pin theo chuột ----------
  const moveTorch = (x, y) => {
    const r = hall.getBoundingClientRect();
    hall.style.setProperty('--mx', `${x - r.left}px`);
    hall.style.setProperty('--my', `${y - r.top}px`);
  };
  hall.addEventListener('pointermove', (e) => moveTorch(e.clientX, e.clientY));

  // ---------- Vẽ tường ảnh ----------
  function renderWall() {
    const wall = el('wall');
    const me = myName();
    wall.replaceChildren();
    state.photos.forEach((p, i) => {
      const fig = document.createElement('figure');
      fig.className = 'frame';
      fig.style.setProperty('--ar', (p.w / p.h).toFixed(3));
      fig.style.setProperty('--i', i);
      fig.innerHTML = '<div class="beam"></div><div class="glow"></div><div class="mat"><img loading="lazy" alt="" /></div><figcaption><span class="cap"></span><span class="likes"></span></figcaption>';
      fig.querySelector('img').src = p.url;
      fig.querySelector('.cap').textContent = p.caption || `của ${p.by}`;
      fig.querySelector('.likes').textContent = p.likes ? `${p.likedBy.includes(me) ? '❤️' : '🤍'} ${p.likes}` : '';
      fig.onclick = () => openLightbox(i);
      wall.append(fig);
    });
    el('empty').hidden = state.photos.length > 0;
    el('count').textContent = `${state.photos.length} bức ảnh trong phòng`;
  }

  let view3d = null;
  function render() {
    view3d?.setLight(state.light);
    view3d?.setPhotos(state.photos);
    hall.dataset.light = state.light;
    for (const b of el('lights').children) b.classList.toggle('active', b.dataset.light === state.light);
    renderWall();
    if (lbIndex >= 0) renderLightbox();
  }

  // ---------- Xem ảnh lớn ----------
  function openLightbox(i) { lbIndex = i; lightbox.hidden = false; renderLightbox(); }
  function closeLightbox() { lbIndex = -1; lightbox.hidden = true; stopSlide(); }
  function step(d) {
    if (!state.photos.length) return closeLightbox();
    lbIndex = (lbIndex + d + state.photos.length) % state.photos.length;
    renderLightbox();
  }
  function renderLightbox() {
    const p = state.photos[lbIndex];
    if (!p) return closeLightbox();
    const img = lbEl('lbImg');
    if (img.getAttribute('src') !== p.url) { img.classList.remove('in'); img.src = p.url; img.onload = () => img.classList.add('in'); }
    lbEl('lbCap').textContent = p.caption || '';
    lbEl('lbMeta').textContent = `📷 ${p.by} · ${new Date(p.ts).toLocaleDateString('vi-VN')} · ${lbIndex + 1}/${state.photos.length}`;
    const liked = p.likedBy.includes(myName());
    lbEl('lbLike').textContent = `${liked ? '❤️' : '🤍'} ${p.likes || ''}`.trim();
    lbEl('lbLike').title = p.likedBy.length ? `Thích: ${p.likedBy.join(', ')}` : 'Thả tim';
    lbEl('lbDownload').href = p.url;
    // nút gỡ ảnh chỉ hiện với người treo ảnh hoặc admin (server cũng tự kiểm tra)
    const del = lightbox.querySelector('[data-act="delete"]');
    if (del) del.hidden = !(p.by === myName() || store.players.get(store.selfId)?.admin);
  }
  const stopSlide = () => { clearInterval(slideTimer); slideTimer = null; lbEl('lbSlide').textContent = '▶ Trình chiếu'; };
  lightbox.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act && e.target === lightbox) return closeLightbox();
    const p = state.photos[lbIndex];
    if (act === 'close') closeLightbox();
    if (act === 'prev') { stopSlide(); step(-1); }
    if (act === 'next') { stopSlide(); step(1); }
    if (act === 'like' && p) { socket.emit('gallery:like', p.id); sound.play('pop'); }
    if (act === 'delete' && p && confirm('Gỡ bức ảnh này khỏi phòng? (mọi người sẽ không thấy nữa)')) socket.emit('gallery:delete', p.id);
    if (act === 'slide') {
      if (slideTimer) stopSlide();
      else { slideTimer = setInterval(() => step(1), 4000); lbEl('lbSlide').textContent = '⏸ Dừng'; }
    }
  });

  // ---------- Treo ảnh ----------
  async function upload(files) {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const err = el('error'), prog = el('progress');
    err.hidden = true;
    let ok = 0;
    for (const [i, f] of files.entries()) {
      prog.textContent = `⏳ Đang treo ảnh ${i + 1}/${files.length}…`;
      try {
        const { blob, w, h } = await prepareImage(f);
        if (blob.size > MAX_BYTES) throw new Error(`"${f.name}" quá nặng (tối đa 4MB)`);
        const res = await fetch('/api/gallery/upload', {
          method: 'POST',
          headers: {
            'x-password': saved.getPassword(), 'x-socket-id': socket.id,
            'x-caption': encodeURIComponent(el('caption').value.trim()), 'x-width': w, 'x-height': h,
          },
          body: blob,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
        ok++;
      } catch (e) {
        err.textContent = `⚠️ ${e.message || 'Không đọc được ảnh'}`;
        err.hidden = false;
      }
    }
    prog.textContent = ok ? `✅ Đã treo ${ok} ảnh` : '';
    if (ok) { el('caption').value = ''; sound.play('correct'); }
    setTimeout(() => { prog.textContent = ''; }, 3000);
  }
  el('file').addEventListener('change', (e) => { upload(e.target.files); e.target.value = ''; });
  hall.addEventListener('dragover', (e) => { e.preventDefault(); hall.classList.add('dragging'); });
  hall.addEventListener('dragleave', (e) => { if (!hall.contains(e.relatedTarget)) hall.classList.remove('dragging'); });
  hall.addEventListener('drop', (e) => { e.preventDefault(); hall.classList.remove('dragging'); upload(e.dataTransfer.files); });

  // ---------- Socket ----------
  const onState = (s) => {
    const changedLight = s.light !== state.light;
    state = s;
    if (changedLight) sound.play('pop');
    render();
  };
  const onKey = (e) => {
    if (lbIndex < 0 || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    // phím mũi tên chỉ lật ảnh, không cho lọt xuống làm nhân vật đi sau lớp ảnh
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); stopSlide(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); stopSlide(); step(1); }
    if (e.key === 'Escape') { e.stopImmediatePropagation(); closeLightbox(); } // Esc đóng ảnh trước, chưa rời phòng
  };

  return {
    title: '🖼️ Phòng Tranh',
    open(view) {
      view3d = view;
      if (view) view.onFrameClick = (i) => openLightbox(i);
      root.hidden = false;
      socket.on('gallery:state', onState);
      window.addEventListener('keydown', onKey, true);
      socket.emit('gallery:sync');
    },
    close() {
      root.hidden = true;
      view3d = null;
      closeLightbox();
      socket.off('gallery:state', onState);
      window.removeEventListener('keydown', onKey, true);
    },
  };
}
