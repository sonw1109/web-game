// 🙏 Bảng bàn thờ Ông Chủ Hội Quán (mở khi đứng trước bàn thờ nhấn E / chạm nút tương tác).
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from './sound.js';

/** Bảng bàn thờ: thắp hương, quỳ lạy, xin quẻ, cầu nguyện, sổ ước nguyện. */
export function initShrinePanel({ getWorld, toast }) {
  const el = document.createElement('div');
  el.id = 'shrine-panel'; el.hidden = true;
  el.innerHTML = `
    <div class="shrine-head"><span>🙏</span><b>Bàn thờ Ông Chủ Hội Quán</b><button class="btn btn-ghost btn-sm" data-close>✕</button></div>
    <p class="shrine-stats"><span data-incense>0</span> nén hương · <span data-bows>0</span> lần lạy</p>
    <p class="shrine-bless" data-bless hidden></p>
    <div class="shrine-actions">
      <button class="btn btn-primary" data-act="incense">🕯️ Thắp hương</button>
      <button class="btn btn-ghost" data-act="kneel">🧎 Quỳ lạy</button>
      <button class="btn btn-ghost" data-act="fortune">🎋 Xin quẻ</button>
    </div>
    <div class="fortune-card" data-fortune hidden></div>
    <form class="shrine-wish" data-wish><input maxlength="80" placeholder="Viết điều ước gửi Ông Chủ…" autocomplete="off"><button class="btn btn-primary btn-sm">🙏 Cầu</button></form>
    <b class="shrine-sub">📜 Sổ ước nguyện</b>
    <ul class="shrine-wishes" data-wishes></ul>
    <p class="muted small">Thắp hương được phù hộ 5 phút (câu cá dễ ra cá hiếm). Cứ 10 nén Ông Chủ sẽ hiển linh!</p>`;
  document.getElementById('hud').append(el);
  const q = (sel) => el.querySelector(sel);
  let blessUntil = 0, wishes = [];
  const paintWishes = () => {
    const ul = q('[data-wishes]');
    ul.replaceChildren(...wishes.slice(-12).reverse().map((w) => { const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = w.name; li.append(b, ` ${w.text}`); return li; }));
    if (!wishes.length) ul.innerHTML = '<li class="muted">Chưa có ai cầu nguyện… hãy là người đầu tiên!</li>';
  };
  const paintBless = () => {
    const left = blessUntil - Date.now(), p = q('[data-bless]');
    p.hidden = left <= 0;
    if (left > 0) p.textContent = `✨ Bạn đang được Ông Chủ phù hộ · còn ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  };
  setInterval(() => { if (!el.hidden) paintBless(); }, 1000);
  const open = () => { el.hidden = false; paintBless(); paintWishes(); socket.emit('shrine:sync'); };
  const close = () => { el.hidden = true; };
  store.on('shrine-open', open);
  q('[data-close]').onclick = close;
  store.on('near-thing', (t) => { if (!el.hidden && !getWorld()?.nearShrine()) close(); void t; });
  store.on('shrine-state', (st) => {
    if (st.incense != null) q('[data-incense]').textContent = st.incense;
    if (st.bows != null) q('[data-bows]').textContent = st.bows;
    if (st.wishes) { wishes = st.wishes; paintWishes(); }
  });
  store.on('shrine-wish', (w) => { wishes.push(w); paintWishes(); });
  q('[data-act=incense]').onclick = () => socket.emit('shrine:incense', null, (r) => {
    if (r?.error) return toast(`🕯️ ${r.error}`);
    blessUntil = r.blessUntil; paintBless();
    toast('🕯️ Đã thắp hương – Ông Chủ phù hộ bạn 5 phút ✨', 3500);
  });
  q('[data-act=kneel]').onclick = () => { close(); getWorld()?.kneel(1); };
  q('[data-act=fortune]').onclick = () => socket.emit('shrine:fortune', null, (r) => {
    const card = q('[data-fortune]');
    if (r?.error) return toast(`🎋 ${r.error}`);
    const f = r.fortune;
    card.hidden = false;
    card.className = `fortune-card lv-${['Đại Cát', 'Thượng Cát', 'Cát'].includes(f.level) ? 'good' : f.level === 'Trung Bình' ? 'mid' : 'bad'}`;
    card.innerHTML = '<span class="fi"></span><div><b></b><p></p></div>';
    card.querySelector('.fi').textContent = f.icon;
    card.querySelector('b').textContent = `Quẻ ${f.level}`;
    card.querySelector('p').textContent = f.text;
    sound.play(card.classList.contains('lv-bad') ? 'wrong' : 'correct');
  });
  q('[data-wish]').onsubmit = (e) => {
    e.preventDefault();
    const input = q('[data-wish] input'), text = input.value.trim();
    if (!text) return;
    socket.emit('shrine:wish', text, (r) => {
      if (r?.error) return toast(`🙏 ${r.error}`);
      input.value = ''; input.blur();
      toast(`🙏 ${r.reply}`, 3500);
    });
  };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
}
