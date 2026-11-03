// 📸 Chụp ảnh: đếm ngược 3-2-1 → chụp cảnh 3D + vẽ tên mọi người lên ảnh → tải về / treo lên Phòng Tranh.
import { socket } from '../net/socket.js';
import { store, saved } from '../store.js';
import { sound } from './sound.js';

const $ = (id) => document.getElementById(id);
const PLACE = { lobby: 'Sảnh', cinema: 'Rạp phim', caro: 'Quán Caro', draw: 'Phòng Vẽ', quiz: 'Phòng Quiz', gallery: 'Phòng Tranh', typing: 'Đường đua', baucua: 'Sòng Bầu Cua' };

/** Vẽ khung bo tròn + chữ. */
function pill(c, text, x, y, k, bg = 'rgba(10,12,25,.7)', fg = '#fff') {
  c.font = `600 ${13 * k}px Outfit, sans-serif`;
  const w = c.measureText(text).width + 16 * k, h = 20 * k;
  c.fillStyle = bg; c.beginPath(); c.roundRect(x - w / 2, y - h, w, h, h / 2); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - h / 2 + 1);
}

export function initPhoto({ getEngine, toast }) {
  const modal = $('photo-modal'), img = $('photo-img'), count = $('photo-count');
  let blob = null, place = 'Sảnh';

  async function shoot() {
    if (!count.hidden) return;
    place = PLACE[store.room] || 'Hội Quán';
    count.hidden = false;
    for (const n of ['3', '2', '1']) { count.textContent = n; count.classList.remove('pop'); void count.offsetWidth; count.classList.add('pop'); sound.play('tick'); await new Promise((r) => setTimeout(r, 750)); }
    count.hidden = true;
    const shot = await getEngine().capture();
    // đèn flash + tiếng màn trập
    document.body.classList.add('flash'); setTimeout(() => document.body.classList.remove('flash'), 350);
    sound.play('pop');
    // vẽ tên người & biển hiệu lên ảnh (chữ HTML không nằm trong canvas 3D)
    const c = shot.getContext('2d'), k = shot.width / window.innerWidth;
    for (const el of document.querySelectorAll('#world-labels:not([hidden]) .sign:not([hidden]), #world-labels:not([hidden]) .plabel:not([hidden]) .name, #room-labels:not([hidden]) .plabel:not([hidden]) .name')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < window.innerHeight) pill(c, el.textContent, (r.left + r.width / 2) * k, r.bottom * k, k, el.classList.contains('sign') ? 'rgba(43,29,20,.85)' : undefined, el.classList.contains('sign') ? '#ffe2b8' : '#fff');
    }
    const d = new Date();
    pill(c, `🏮 Hội Quán · ${place} · ${d.toLocaleDateString('vi-VN')} ${d.toTimeString().slice(0, 5)}`, shot.width - 170 * k, shot.height - 14 * k, k);
    // thu nhỏ còn tối đa 1920px, JPEG cho nhẹ
    const s = Math.min(1, 1920 / Math.max(shot.width, shot.height));
    const out = document.createElement('canvas'); out.width = Math.round(shot.width * s); out.height = Math.round(shot.height * s);
    out.getContext('2d').drawImage(shot, 0, 0, out.width, out.height);
    blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.88));
    if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src); // giải phóng ảnh chụp trước
    img.src = URL.createObjectURL(blob);
    img.dataset.w = out.width; img.dataset.h = out.height;
    $('photo-download').href = img.src;
    $('photo-download').download = `hoi-quan-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
    $('photo-hang').disabled = false; $('photo-hang').textContent = '🖼️ Treo lên Phòng Tranh';
    modal.hidden = false;
  }

  $('photo-hang').onclick = async () => {
    if (!blob) return;
    const b = $('photo-hang');
    b.disabled = true; b.textContent = '⏳ Đang treo…';
    try {
      const res = await fetch('/api/gallery/upload', {
        method: 'POST', body: blob,
        headers: { 'x-password': saved.getPassword(), 'x-socket-id': socket.id, 'x-caption': encodeURIComponent(`📸 Ảnh chụp ở ${place}`), 'x-width': img.dataset.w, 'x-height': img.dataset.h },
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Lỗi ${res.status}`);
      b.textContent = '✅ Đã treo – vào Phòng Tranh xem nhé!';
      toast('🖼️ Ảnh đã được treo lên Phòng Tranh');
    } catch (e) { b.disabled = false; b.textContent = `⚠️ ${e.message} – thử lại`; }
  };
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) { modal.hidden = true; } });
  return { shoot };
}
