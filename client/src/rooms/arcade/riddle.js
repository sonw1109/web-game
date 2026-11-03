// 🧠 Đố Mẹo – UI
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './riddle.css';

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="rd-card" data-el="card">
      <div class="rd-top">
        <span class="rd-round" data-el="round"></span>
        <span class="rd-sec" data-el="sec"></span>
      </div>
      <div class="timer-bar"><div data-el="timer"></div></div>
      <div class="rd-q" data-el="q"></div>
      <div class="rd-hint" data-el="hint" hidden></div>
      <div class="rd-mask" data-el="mask" hidden></div>
      <div class="rd-answer" data-el="answer" hidden></div>
      <form class="rd-form" data-el="form" autocomplete="off">
        <input class="rd-input" data-el="input" maxlength="60" placeholder="Gõ câu trả lời…" enterkeyhint="send" />
        <button class="btn btn-primary" type="submit">Trả lời</button>
      </form>
      <div class="rd-feedback" data-el="fb"></div>
      <div class="rd-solved" data-el="solved"></div>
      <div class="rd-cta" data-el="cta"></div>
    </div>
  </div>
  <aside class="game-side">
    <h3>Bảng điểm</h3>
    <ol class="rd-scores" data-el="scores"></ol>
    <p class="muted small" data-el="empty">Chưa ai ghi điểm.</p>
    <div class="rd-actions" data-el="actions"></div>
    <p class="muted small">Luật: mỗi ván 10 câu đố mẹo. Có 40 giây cho mỗi câu – sau 15 giây hiện gợi ý, sau 28 giây hiện chữ cái đầu. Trả lời càng sớm càng nhiều điểm (100 → 40). Mỗi câu được đoán tối đa 8 lần. Không cần gõ dấu, không cần chữ "con / cái / quả".</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-riddle');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null, fbTimer = null, lastDrawKey = '';

  const card = el('card');
  const solvedMe = () => !!state?.solved.some((x) => x.id === store.selfId);
  const feedback = (text, cls = '') => {
    const fb = el('fb');
    fb.textContent = text; fb.className = `rd-feedback ${cls}`;
    clearTimeout(fbTimer);
    if (text) fbTimer = setTimeout(() => { fb.textContent = ''; }, 2500);
  };

  el('form').onsubmit = (e) => {
    e.preventDefault();
    const input = el('input');
    const text = input.value.trim().slice(0, 60);
    if (!text || state?.phase !== 'ask') return;
    socket.emit('riddle:answer', text, (r) => {
      if (!r) return;
      if (r.correct) { sound.play('correct'); feedback(`🎉 Chính xác! +${r.pts} điểm`, 'ok'); input.value = ''; }
      else if (r.ok) {
        sound.play('wrong'); feedback(`❌ Chưa đúng… (còn ${r.left} lần)`, 'bad');
        input.select();
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      } else if (r.reason === 'limit') feedback('Bạn đã hết 8 lần đoán cho câu này', 'bad');
      else if (r.reason === 'slow') feedback('Chậm lại chút nhé…', 'bad');
      else if (r.reason === 'solved') feedback('Bạn đã trả lời đúng rồi!', 'ok');
    });
  };

  function render() {
    if (!state) return;
    const s = state;
    el('round').textContent = s.phase === 'idle' ? '🧠 Đố Mẹo' : s.phase === 'over' ? '🏁 Hết ván' : `Câu ${s.round}/${s.rounds}`;
    el('q').textContent = s.phase === 'idle' ? 'Sẵn sàng chưa? Bấm bắt đầu để chơi 10 câu đố mẹo!' :
      s.phase === 'over' ? (s.winners.length ? `🏆 ${s.winners.map((w) => w.name).join(', ')} thắng ván này!` : 'Hết ván – chưa ai ghi điểm 😅') : s.q;
    el('q').classList.toggle('big', s.phase === 'over');
    el('hint').hidden = !s.hint || s.phase === 'over';
    el('hint').textContent = s.hint ? `💡 Gợi ý: ${s.hint}` : '';
    el('mask').hidden = !s.mask;
    el('mask').textContent = s.mask || '';
    el('answer').hidden = !s.answer || s.phase !== 'reveal';
    el('answer').textContent = s.answer ? `✅ Đáp án: ${s.answer}` : '';

    const canType = s.phase === 'ask' && !solvedMe();
    el('form').hidden = s.phase !== 'ask';
    el('input').disabled = !canType;
    el('input').placeholder = solvedMe() ? 'Bạn đã đúng – chờ mọi người nhé 😎' : 'Gõ câu trả lời…';

    // ai đã đúng câu này
    const sv = el('solved');
    sv.replaceChildren();
    if (s.phase === 'ask' || s.phase === 'reveal') {
      for (const x of s.solved) {
        const chip = document.createElement('span');
        chip.className = `rd-chip${x.id === store.selfId ? ' me' : ''}`;
        chip.textContent = `✔ ${x.name} +${x.pts}`;
        sv.append(chip);
      }
    }

    // nút lớn
    const cta = el('cta');
    cta.replaceChildren();
    if (s.phase === 'idle' || s.phase === 'over') {
      const b = document.createElement('button');
      b.className = 'btn btn-primary btn-big';
      b.textContent = s.phase === 'idle' ? '▶ Bắt đầu' : '▶ Chơi ván mới ngay';
      b.onclick = () => socket.emit('riddle:start');
      cta.append(b);
      if (s.phase === 'over') {
        const m = document.createElement('div'); m.className = 'muted small'; m.dataset.el = 'auto';
        cta.append(m);
      }
    }

    // bảng điểm
    const ol = el('scores');
    ol.replaceChildren();
    s.scores.forEach((x, i) => {
      const li = document.createElement('li');
      li.className = x.id === store.selfId ? 'me' : '';
      const n = document.createElement('span'); n.textContent = `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${x.name}${x.id === store.selfId ? ' (bạn)' : ''}`;
      const p = document.createElement('b'); p.textContent = x.pts;
      li.append(n, p); ol.append(li);
    });
    el('empty').hidden = s.scores.length > 0;

    view3d?.setPlayers(s.scores.slice(0, 6).map((x) => x.id));
    drawTable();
  }

  function drawTable() {
    const s = state;
    const key = [s.phase, s.qid, !!s.hint, !!s.mask, s.answer, s.solved.length].join('|');
    if (!view3d || key === lastDrawKey) return;
    lastDrawKey = key;
    view3d.drawTable((c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#4a1f63'); g.addColorStop(1, '#22102f');
      c.fillStyle = g; roundRect(c, 24, 24, w - 48, h - 48, 40); c.fill();
      c.strokeStyle = '#f5c86a'; c.lineWidth = 8; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe9b0';
      c.font = 'bold 54px "Baloo 2", sans-serif';
      c.fillText(s.phase === 'idle' ? '🧠 ĐỐ MẸO' : s.phase === 'over' ? '🏁 HẾT VÁN' : `CÂU ${s.round}/${s.rounds}`, w / 2, 100);
      c.fillStyle = '#fff';
      c.font = 'bold 44px "Baloo 2", sans-serif';
      const text = s.phase === 'over' ? (s.winners[0] ? `🏆 ${s.winners.map((x) => x.name).join(', ')}` : 'Không ai ghi điểm') : s.q || 'Chờ bắt đầu…';
      const lines = wrap(c, text, w - 120).slice(0, 6);
      const y0 = h / 2 - (lines.length - 1) * 30 - 20;
      lines.forEach((l, i) => c.fillText(l, w / 2, y0 + i * 60));
      c.font = '34px "Baloo 2", sans-serif';
      if (s.answer && s.phase === 'reveal') { c.fillStyle = '#7dffa8'; c.fillText(`✅ ${s.answer}`, w / 2, h - 130); }
      else if (s.hint) { c.fillStyle = '#ffd36b'; wrap(c, `💡 ${s.hint}`, w - 120).slice(0, 2).forEach((l, i) => c.fillText(l, w / 2, h - 150 + i * 42)); }
      if (s.solved.length && s.phase !== 'over') { c.fillStyle = '#cfe8ff'; c.fillText(`✔ ${s.solved.length} người đã đúng`, w / 2, h - 70); }
    });
  }

  function tickTimer() {
    if (!state) return;
    const left = Math.max(0, state.remainingMs - (Date.now() - receivedAt));
    const total = state.phase === 'ask' ? state.askMs : state.phase === 'reveal' ? state.revealMs : state.phase === 'over' ? state.overMs : 0;
    el('timer').style.width = total ? `${(left / total) * 100}%` : '0%';
    el('timer').classList.toggle('low', state.phase === 'ask' && left < 10_000);
    el('sec').textContent = state.phase === 'ask' ? `⏱ ${Math.ceil(left / 1000)}s` : '';
    const auto = root.querySelector('[data-el="auto"]');
    if (auto) auto.textContent = `Ván mới tự bắt đầu sau ${Math.ceil(left / 1000)} giây`;
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (prev && prev.qid !== s.qid && s.phase === 'ask') { sound.play('start'); el('input').value = ''; feedback(''); if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => el('input').focus({ preventScroll: true }), 50); }
    if (prev?.phase === 'ask' && s.phase === 'reveal') sound.play(solvedMe() ? 'pop' : 'tick');
    if (prev && prev.phase !== 'over' && s.phase === 'over') sound.play(s.winners.some((w) => w.id === store.selfId) ? 'win' : 'pop');
    if (prev && s.hint && !prev.hint) sound.play('tick');
    render();
  };

  return {
    title: '🧠 Đố Mẹo',
    open(view) {
      view3d = view; lastDrawKey = '';
      root.hidden = false;
      socket.on('riddle:state', onState);
      socket.emit('riddle:sync');
      timer = setInterval(tickTimer, 200);
    },
    close() {
      root.hidden = true;
      socket.off('riddle:state', onState);
      clearInterval(timer); clearTimeout(fbTimer);
      view3d = null; state = null;
    },
  };
}

function wrap(c, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
