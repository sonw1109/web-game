// ⌨️ Đua Gõ Phím – UI. Gõ có dấu hay không dấu đều được (so sánh bỏ dấu).
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from '../ui/sound.js';

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
function correctPrefix(target, typed) {
  const a = fold(target), b = fold(typed);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main typing-main">
    <div class="typing-card" data-el="card"></div>
  </div>
  <aside class="game-side">
    <h3>Tay đua</h3>
    <ol class="scoreboard" data-el="board"></ol>
    <p class="muted small">Gõ đúng câu hiện trên màn hình – có dấu hay không dấu đều được. Gõ sai phải xóa lùi mới đi tiếp.</p>
  </aside>
</div>`;

export function createTypingRoom() {
  const root = document.getElementById('room-typing');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null;
  let myProgress = 0, lastSent = 0, sendTimer = null, renderedPhase = '';

  const node = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const me = () => state?.racers.find((r) => r.id === store.selfId);

  function renderCard() {
    const s = state, card = el('card');
    renderedPhase = s.phase;
    card.replaceChildren();
    if (s.phase === 'idle' || s.phase === 'over') {
      card.classList.add('center');
      if (s.phase === 'over' && s.results) {
        card.append(node('h2', 'pixel', '🏁 Kết quả'));
        const ol = node('ol', 'final');
        s.results.forEach((r, i) => ol.append(node('li', r.id === store.selfId ? 'me' : '', `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${r.name} – ${r.finished ? `${r.wpm} từ/phút` : 'chưa về đích'}`)));
        card.append(ol);
      } else {
        card.append(node('div', 'big', '⌨️'), node('h2', 'pixel', 'Đua Gõ Phím'), node('p', 'muted', 'Ai gõ xong câu trước thì thắng. Nhân vật của bạn chạy trên đường đua theo tốc độ gõ!'));
      }
      const b = node('button', 'btn btn-primary', s.phase === 'over' ? 'Đua lại' : 'Bắt đầu đua');
      b.onclick = () => socket.emit('typing:start');
      card.append(b);
      return;
    }
    card.classList.remove('center');
    const head = node('div', 'typing-head');
    head.append(node('span', 'pill', ''), node('span', 'pill wpm', '0 từ/phút'));
    const text = node('div', 'typing-text');
    const input = node('input', 'typing-input');
    Object.assign(input, { placeholder: 'Gõ vào đây…', autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.disabled = s.phase !== 'racing' || !me() || !!me()?.finishedMs;
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', (e) => e.stopPropagation()); // không để phím lọt ra game (E, số…)
    card.append(head, text, input);
    if (!me()) card.append(node('p', 'muted small', '👀 Bạn đang xem – chờ cuộc đua sau để tham gia'));
    paintText(input.value);
    if (s.phase === 'racing' && !input.disabled) setTimeout(() => input.focus(), 30);
  }

  /** Tô màu câu: phần đúng (xanh), ký tự đang gõ, phần sai (đỏ), phần còn lại. */
  function paintText(typed) {
    const box = root.querySelector('.typing-text');
    if (!box || !state?.text) return;
    const t = state.text.normalize('NFC');
    const ok = correctPrefix(t, typed);
    const wrong = Math.max(0, Math.min(t.length - ok, fold(typed).length - ok));
    box.replaceChildren(
      node('span', 'ok', t.slice(0, ok)),
      node('span', wrong ? 'bad' : 'cur', t.slice(ok, ok + Math.max(1, wrong))),
      node('span', 'rest', t.slice(ok + Math.max(1, wrong))),
    );
    root.querySelector('.typing-input')?.classList.toggle('error', wrong > 0);
  }

  function onInput(e) {
    const typed = e.target.value;
    paintText(typed);
    const ok = correctPrefix(state.text.normalize('NFC'), typed);
    if (ok > myProgress) {
      myProgress = ok;
      view3d?.setLocalProgress(store.selfId, ok);
      // gửi tối đa ~6 lần/giây, gửi ngay khi về đích
      const len = fold(state.text).length;
      clearTimeout(sendTimer);
      if (ok >= len || Date.now() - lastSent > 160) { lastSent = Date.now(); socket.emit('typing:progress', ok); }
      else sendTimer = setTimeout(() => { lastSent = Date.now(); socket.emit('typing:progress', myProgress); }, 160);
      if (ok >= len) { e.target.disabled = true; sound.play('win'); }
    }
  }

  function renderBoard() {
    const ol = el('board');
    ol.replaceChildren();
    const len = state.text ? fold(state.text).length : 1;
    const list = state.racers.length ? [...state.racers].sort((a, b) => (a.place || 99) - (b.place || 99) || b.progress - a.progress) : [];
    for (const r of list) {
      const li = node('li', r.id === store.selfId ? 'me' : '');
      li.append(node('span', null, `${r.place ? '🏁 ' : ''}${r.name}`), node('b', null, r.finishedMs ? `${r.wpm} wpm` : `${Math.round((r.progress / len) * 100)}%`));
      ol.append(li);
    }
    if (!list.length) ol.append(node('li', 'muted', 'Chưa có cuộc đua'));
  }

  function tick() {
    if (!state) return;
    const pill = root.querySelector('.typing-head .pill');
    if (state.phase === 'countdown') {
      const n = Math.ceil((state.startInMs - (Date.now() - receivedAt)) / 1000);
      if (pill) pill.textContent = n > 0 ? `⏳ Xuất phát sau ${n}…` : '🏃 Chạy!';
    } else if (state.phase === 'racing') {
      const left = Math.max(0, Math.ceil((state.remainingMs - (Date.now() - receivedAt)) / 1000));
      if (pill) pill.textContent = `⏱ ${left}s`;
      const r = me();
      const w = root.querySelector('.wpm');
      if (w && r) w.textContent = `${r.finishedMs ? r.wpm : liveWpm()} từ/phút`;
      // Server ghi nhận thấp hơn (gõ quá nhanh bị giới hạn, hoặc rớt gói tin) → gửi lại
      if (r && !r.finishedMs && r.progress < myProgress && Date.now() - lastSent > 400) { lastSent = Date.now(); socket.emit('typing:progress', myProgress); }
    }
  }
  let raceStartLocal = 0;
  const liveWpm = () => (raceStartLocal ? Math.round((myProgress / 5) / Math.max(0.05, (Date.now() - raceStartLocal) / 60000)) : 0);

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (s.phase === 'countdown' && prev?.phase !== 'countdown') { myProgress = 0; raceStartLocal = 0; sound.play('start'); }
    if (s.phase === 'racing' && prev?.phase !== 'racing') raceStartLocal = Date.now();
    if (s.phase === 'over' && prev?.phase === 'racing') sound.play(s.results?.[0]?.id === store.selfId ? 'win' : 'pop');
    view3d?.setState(s);
    if (s.phase !== renderedPhase) renderCard();
    renderBoard();
  };

  return {
    title: '⌨️ Đua Gõ Phím',
    open(view) {
      view3d = view;
      root.hidden = false;
      renderedPhase = '';
      socket.on('typing:state', onState);
      socket.emit('typing:sync');
      timer = setInterval(tick, 200);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('typing:state', onState);
      clearInterval(timer); clearTimeout(sendTimer);
      state = null; myProgress = 0;
    },
  };
}
