// ❓ Phòng Quiz – UI
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from '../ui/sound.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TEMPLATE = `
<div class="game-layout">
  <div class="game-main quiz-main" data-el="main"></div>
  <aside class="game-side">
    <h3>Bảng xếp hạng</h3>
    <ol class="scoreboard" data-el="board"></ol>
    <button class="btn btn-ghost btn-sm restart-btn" data-el="restart" hidden>🔄 Chơi ván mới</button>
  </aside>
</div>`;

export function createQuizRoom() {
  const root = document.getElementById('room-quiz');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, myChoice = null, lastTick = -1;

  const node = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const left = () => Math.max(0, state.remainingMs - (Date.now() - receivedAt));

  function renderMain() {
    const s = state, main = el('main');
    main.replaceChildren();
    if (s.phase === 'idle' || s.phase === 'over') {
      const card = node('div', 'quiz-card center');
      if (s.phase === 'over' && s.board.length) {
        card.append(node('h2', 'pixel', '🏆 Kết quả chung cuộc'));
        const podium = node('div', 'podium');
        [1, 0, 2].forEach((rank) => {
          const p = s.board[rank];
          if (!p) return;
          const col = node('div', `pod pod-${rank + 1}`);
          col.append(node('div', 'pod-medal', ['🥇', '🥈', '🥉'][rank]), node('div', 'pod-name', p.name), node('div', 'pod-score', `${p.score}`), node('div', 'pod-bar'));
          podium.append(col);
        });
        card.append(podium);
      } else {
        card.append(node('div', 'big', '❓'), node('h2', 'pixel', 'Đố vui Hội Quán'),
          node('p', 'muted', '10 câu hỏi, 15 giây mỗi câu. Trả lời đúng và càng nhanh thì càng nhiều điểm!'));
      }
      const btn = node('button', 'btn btn-primary', s.phase === 'over' ? 'Chơi lại' : 'Bắt đầu');
      btn.onclick = () => socket.emit('quiz:start');
      card.append(btn, node('p', 'muted small', `${s.members.length} người trong phòng`));
      main.append(card);
      return;
    }
    if (s.phase === 'countdown') {
      main.append(node('div', 'quiz-card center', null));
      main.firstChild.append(node('p', 'muted', 'Chuẩn bị…'), node('div', 'countdown pixel', ''));
      return;
    }
    // question / reveal
    const card = node('div', 'quiz-card');
    const head = node('div', 'quiz-head');
    head.append(node('span', 'pill', `Câu ${s.index + 1}/${s.total}`), node('span', 'pill', `✋ ${s.answeredIds.length}/${s.members.length} đã trả lời`));
    card.append(head, node('div', 'timer-bar'), node('h2', 'quiz-q', s.question.q));
    card.querySelector('.timer-bar').append(node('div'));
    const grid = node('div', 'answers');
    s.question.a.forEach((text, i) => {
      const b = node('button', `answer a${i}`);
      b.append(node('span', 'letter', LETTERS[i]), node('span', null, text));
      const answered = myChoice !== null || s.answeredIds.includes(store.selfId);
      b.disabled = s.phase !== 'question' || answered;
      if (myChoice === i) b.classList.add('picked');
      if (s.phase === 'reveal') {
        b.classList.add(i === s.correct ? 'correct' : 'wrong');
        const who = Object.entries(s.reveal).filter(([, c]) => c === i).map(([id]) => s.board.find((p) => p.id === id)?.name).filter(Boolean);
        if (who.length) b.append(node('span', 'who', who.join(', ')));
      }
      b.onclick = () => { myChoice = i; socket.emit('quiz:answer', i); sound.play('pop'); renderMain(); };
      grid.append(b);
    });
    card.append(grid);
    if (s.phase === 'reveal') {
      const me = s.board.find((p) => p.id === store.selfId);
      const ok = s.reveal[store.selfId] === s.correct;
      card.append(node('p', `quiz-result ${ok ? 'ok' : 'bad'}`,
        s.reveal[store.selfId] === undefined ? '⌛ Bạn chưa trả lời kịp' : ok ? `🎉 Chính xác! +${me?.last ?? 0}` : '😢 Sai mất rồi'));
    }
    main.append(card);
    tickTimer();
  }

  function renderBoard() {
    el('restart').hidden = state.phase === 'idle' || state.phase === 'over';
    const ol = el('board');
    ol.replaceChildren();
    for (const p of state.board.length ? state.board : state.members.map((m) => ({ ...m, score: 0 }))) {
      const li = node('li', p.id === store.selfId ? 'me' : '');
      const n = node('span', null, p.name);
      const sc = node('b', null, String(p.score));
      if (state.phase === 'reveal' && p.last) sc.append(node('small', 'gain', ` +${p.last}`));
      li.append(n, sc);
      ol.append(li);
    }
  }

  function tickTimer() {
    if (!state) return;
    const ms = left();
    if (state.phase === 'countdown') {
      const c = root.querySelector('.countdown');
      if (c) c.textContent = Math.max(1, Math.ceil(ms / 1000));
    }
    const bar = root.querySelector('.timer-bar > div');
    if (bar && state.phase === 'question') {
      bar.style.width = `${(ms / state.totalMs) * 100}%`;
      bar.classList.toggle('low', ms < 5000);
      const sec = Math.ceil(ms / 1000);
      if (sec <= 5 && sec !== lastTick && myChoice === null) { lastTick = sec; sound.play('tick'); }
    } else if (bar) bar.style.width = '0%';
  }

  let view3d = null;
  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    view3d?.setState(s);
    if (prev?.index !== s.index || s.phase === 'countdown') { myChoice = null; lastTick = -1; }
    if (prev?.phase === 'question' && s.phase === 'reveal') sound.play(s.reveal[store.selfId] === s.correct ? 'correct' : 'wrong');
    if (prev?.phase !== 'over' && s.phase === 'over') sound.play('win');
    if (prev?.phase !== 'countdown' && s.phase === 'countdown') sound.play('start');
    // Chỉ dựng lại phần câu hỏi khi đổi phase/câu (tránh nhấp nháy)
    if (!prev || prev.phase !== s.phase || prev.index !== s.index || s.phase === 'idle' || s.phase === 'over') renderMain();
    else {
      const pill = root.querySelectorAll('.quiz-head .pill')[1];
      if (pill) pill.textContent = `✋ ${s.answeredIds.length}/${s.members.length} đã trả lời`;
    }
    renderBoard();
  };
  el('restart').onclick = () => { if (confirm('Hủy ván đang chơi và bắt đầu ván mới?')) socket.emit('quiz:restart'); };

  const onKey = (e) => {
    if (!state || state.phase !== 'question' || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return; // Ctrl+C, Cmd+A… không phải là chọn đáp án
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    const j = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
    const k = i >= 0 ? i : j;
    if (k >= 0) root.querySelectorAll('.answer')[k]?.click();
  };

  return {
    title: '❓ Phòng Quiz',
    open(view) {
      view3d = view;
      root.hidden = false;
      socket.on('quiz:state', onState);
      window.addEventListener('keydown', onKey);
      socket.emit('quiz:sync');
      timer = setInterval(tickTimer, 100);
    },
    close() {
      root.hidden = true;
      view3d = null;
      socket.off('quiz:state', onState);
      window.removeEventListener('keydown', onKey);
      clearInterval(timer);
      state = null; myChoice = null;
    },
  };
}
