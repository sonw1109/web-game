// 🎭 Bảng biểu cảm: nút 🎭 trên thanh emoji hoặc phím Q.
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { EMOTE_LIST } from '../three/expressions.js';

/** bar: thanh emoji (#emoji-bar) – nút 🎭 được gắn vào cuối thanh. */
export function initEmotePanel(bar) {
  const panel = document.createElement('div');
  panel.id = 'emote-panel'; panel.hidden = true;
  panel.innerHTML = '<b>Biểu cảm</b><div class="emote-grid"></div>';
  EMOTE_LIST.forEach((em, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span>${em.icon}</span><small></small>`;
    b.querySelector('small').textContent = em.name + (i < 4 ? ` · ${[7, 8, 9, 0][i]}` : '');
    b.onclick = () => { socket.emit('emote:send', em.id); panel.hidden = true; };
    panel.querySelector('.emote-grid').append(b);
  });
  document.getElementById('hud').append(panel);
  const more = document.createElement('button');
  more.className = 'emote-more'; more.innerHTML = '🎭<small>Q</small>'; more.title = 'Biểu cảm';
  more.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; document.body.classList.remove('emoji-open'); };
  bar.append(more);
  store.on('toggle-emotes', () => { panel.hidden = !panel.hidden; });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && e.target !== more && !more.contains(e.target)) panel.hidden = true; });
}
