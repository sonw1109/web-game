import { socket } from '../net/socket.js';
import { store } from '../store.js';

const ROOM_TAG = { cinema: '🎬', draw: '🎨', quiz: '❓', caro: '⭕', gallery: '🖼️' };
const MAX_MSGS = 150;

export function initChat() {
  const box = document.getElementById('chat');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const unread = document.getElementById('chat-unread');
  let unreadN = 0;
  box.hidden = false;
  // Điện thoại: chat thu gọn mặc định (chỉ còn ô nhập), bấm 💬 để mở
  const setCollapsed = (v) => {
    box.classList.toggle('collapsed', v);
    if (!v) { unreadN = 0; unread.hidden = true; log.scrollTop = log.scrollHeight; }
  };
  setCollapsed(matchMedia('(max-width: 700px)').matches);
  document.getElementById('chat-toggle').onclick = () => setCollapsed(!box.classList.contains('collapsed'));
  store.on('chat-collapse', () => { if (!box.classList.contains('collapsed')) setCollapsed(true); });

  const add = (m) => {
    const div = document.createElement('div');
    div.className = `msg${m.system ? ' sys' : ''}`;
    if (m.system) div.textContent = m.text;
    else {
      if (ROOM_TAG[m.room]) {
        const tag = document.createElement('span');
        tag.className = 'tag'; tag.textContent = ROOM_TAG[m.room];
        div.append(tag);
      }
      const b = document.createElement('b');
      b.textContent = `${m.name}: `;
      div.append(b, document.createTextNode(m.text));
    }
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.append(div);
    while (log.children.length > MAX_MSGS) log.firstChild.remove();
    if (atBottom) log.scrollTop = log.scrollHeight;
    if (box.classList.contains('collapsed') && !m.system) { unreadN++; unread.textContent = unreadN > 9 ? '9+' : unreadN; unread.hidden = false; }
  };

  socket.on('chat:message', add);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (t) socket.emit('chat:send', t);
    input.value = '';
    input.blur();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.blur(); }
    e.stopPropagation();
  });

  // Enter ở bất cứ đâu → focus ô chat
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    input.focus();
  });
}
