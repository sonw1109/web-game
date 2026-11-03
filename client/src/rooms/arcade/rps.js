// ✊ Oẳn Tù Tì – UI
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';
import { sound } from '../../ui/sound.js';
import './rps.css';

const HAND = { rock: '✊', paper: '✋', scissors: '✌️' };
const LABEL = { rock: 'Búa', paper: 'Bao', scissors: 'Kéo' };
const ORDER = ['rock', 'paper', 'scissors'];

const TEMPLATE = `
<div class="game-layout">
  <div class="game-main">
    <div class="rps-stage" data-el="stage">
      <div class="rps-phase" data-el="phase"></div>
      <div class="timer-bar"><div data-el="timer"></div></div>
      <div class="rps-big" data-el="big"></div>
      <div class="rps-picks" data-el="picks"></div>
      <div class="rps-hands" data-el="hands"></div>
      <div class="rps-beats" data-el="beats"></div>
    </div>
  </div>
  <aside class="game-side">
    <h3>Bảng điểm phiên</h3>
    <ol class="rps-scores" data-el="scores"></ol>
    <div class="rps-actions" data-el="actions"></div>
    <p class="muted small">Luật: mỗi vòng đếm 3-2-1 rồi có 8 giây để chọn Búa ✊ / Kéo ✌️ / Bao ✋ (đổi được tới hết giờ). Hết giờ mọi lựa chọn cùng lộ ra: thắng mỗi người được +1 điểm. Búa thắng Kéo, Kéo thắng Bao, Bao thắng Búa. Thắng nhiều hơn thua thì nối dài chuỗi 🔥. Cần ít nhất 2 người chơi.</p>
  </aside>
</div>`;

export function createRoom() {
  const root = document.getElementById('room-rps');
  root.innerHTML = TEMPLATE;
  const el = (n) => root.querySelector(`[data-el="${n}"]`);
  let state = null, receivedAt = 0, timer = null, view3d = null, myPick = null, lastSec = -1, lastDraw = '';

  const me = () => state?.players.find((p) => p.id === store.selfId);
  const nameOf = (id) => state?.players.find((p) => p.id === id)?.name ?? '?';

  // 3 nút chọn to
  const pickBtns = ORDER.map((c) => {
    const b = document.createElement('button');
    b.className = 'rps-pick';
    b.dataset.choice = c;
    const em = document.createElement('span'); em.className = 'em'; em.textContent = HAND[c];
    const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = LABEL[c];
    b.append(em, lb);
    b.onclick = () => choose(c);
    el('picks').append(b);
    return b;
  });

  function choose(c) {
    if (state?.phase !== 'pick' || me()?.watching) return;
    myPick = c;
    socket.emit('rps:pick', c);
    sound.play('pop');
    renderPicks();
  }

  function renderPicks() {
    const can = state?.phase === 'pick' && me() && !me().watching;
    pickBtns.forEach((b) => {
      b.disabled = !can;
      b.classList.toggle('chosen', myPick === b.dataset.choice && state?.phase !== 'result');
    });
    el('picks').hidden = !me() || me().watching || state?.phase === 'idle';
  }

  function render() {
    const s = state;
    if (!s) return;
    const active = s.players.filter((p) => !p.watching);
    const stage = el('stage');
    stage.dataset.phase = s.phase;

    el('phase').textContent = {
      idle: active.length < 2 ? '✊ Cần ít nhất 2 người chơi…' : '✊ Sắp bắt đầu…',
      count: `Vòng ${s.round} – chuẩn bị!`,
      pick: me()?.watching ? '👀 Mọi người đang chọn…' : myPick ? `Bạn chọn ${LABEL[myPick]} ${HAND[myPick]} – còn đổi được` : '👉 Chọn ngay!',
      result: `Kết quả vòng ${s.round}`,
    }[s.phase];

    // các tay của người chơi
    const hands = el('hands');
    hands.replaceChildren();
    for (const p of active) {
      const d = document.createElement('div');
      d.className = `rps-hand${p.id === store.selfId ? ' me' : ''}`;
      const em = document.createElement('div'); em.className = 'em';
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = p.name;
      const sub = document.createElement('div'); sub.className = 'sub';
      if (s.phase === 'result' && s.last) {
        const c = s.last.picks[p.id];
        em.textContent = c ? HAND[c] : '💤';
        const g = s.last.gains[p.id], l = s.last.losses[p.id];
        if (c) {
          sub.textContent = g ? `+${g}` : l ? 'thua' : 'hòa';
          d.classList.add(g > l ? 'win' : l > g ? 'lose' : 'draw');
        } else sub.textContent = 'không chọn';
        d.classList.add('reveal');
      } else if (s.phase === 'pick') {
        em.textContent = p.picked ? '✅' : '🤔';
        sub.textContent = p.picked ? 'đã chọn' : 'đang nghĩ…';
        if (p.picked) d.classList.add('ready');
      } else {
        em.textContent = '✊';
        if (s.phase === 'count') d.classList.add('shaking');
        sub.textContent = p.streak >= 2 ? `🔥 ${p.streak}` : '';
      }
      d.append(em, nm, sub);
      hands.append(d);
    }

    // ai thắng ai
    const beats = el('beats');
    beats.replaceChildren();
    if (s.phase === 'result' && s.last) {
      if (!s.last.wins.length) {
        const li = document.createElement('div'); li.className = 'rps-line'; li.textContent = Object.keys(s.last.picks).length < 2 ? 'Không đủ người ra tay 😴' : '🤝 Hòa cả làng!';
        beats.append(li);
      }
      for (const [a, b] of s.last.wins.slice(0, 30)) {
        const li = document.createElement('div');
        li.className = `rps-line${a === store.selfId ? ' good' : b === store.selfId ? ' bad' : ''}`;
        li.textContent = `${nameOf(a)} ${HAND[s.last.picks[a]]} thắng ${nameOf(b)} ${HAND[s.last.picks[b]]}`;
        beats.append(li);
      }
    }

    // bảng điểm
    const ol = el('scores');
    ol.replaceChildren();
    [...s.players].sort((a, b) => b.score - a.score).forEach((p, i) => {
      const li = document.createElement('li');
      li.className = `${p.id === store.selfId ? 'me' : ''}${p.watching ? ' watching' : ''}`;
      const n = document.createElement('span');
      n.textContent = `${p.watching ? '👀' : ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${p.name}${p.id === store.selfId ? ' (bạn)' : ''}`;
      const sc = document.createElement('b');
      sc.textContent = `${p.score}${p.streak >= 2 ? ` 🔥${p.streak}` : ''}`;
      sc.title = `Chuỗi thắng dài nhất: ${p.best}`;
      li.append(n, sc); ol.append(li);
    });

    const actions = el('actions');
    actions.replaceChildren();
    if (me()) {
      const b = document.createElement('button');
      b.className = `btn btn-sm ${me().watching ? 'btn-primary' : 'btn-ghost'}`;
      b.textContent = me().watching ? '✋ Tham gia chơi' : '👀 Chỉ xem';
      b.onclick = () => socket.emit('rps:watch', !me().watching);
      actions.append(b);
    }

    renderPicks();
    view3d?.setPlayers(active.slice(0, 6).map((p) => p.id));
    drawTable(active);
  }

  function drawTable(active) {
    const s = state;
    const key = JSON.stringify([s.phase, s.round, active.map((p) => [p.id, p.picked]), s.last?.round]);
    if (!view3d || key === lastDraw) return;
    lastDraw = key;
    view3d.drawTable((c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 1.4);
      g.addColorStop(0, '#e67e22'); g.addColorStop(1, '#5a2405');
      c.fillStyle = g; c.fillRect(20, 20, w - 40, h - 40);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff4dc'; c.font = 'bold 56px "Baloo 2", sans-serif';
      c.fillText(s.phase === 'result' ? `VÒNG ${s.round}` : s.phase === 'idle' ? 'OẲN TÙ TÌ' : 'RA CÁI GÌ…?', w / 2, 90);
      const n = Math.max(1, active.length), R = 230;
      active.slice(0, 12).forEach((p, i) => {
        const a = Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = w / 2 + Math.cos(a) * R * (n > 1 ? 1 : 0), y = h / 2 + 30 + Math.sin(a) * R * (n > 1 ? 0.8 : 0);
        const pick = s.phase === 'result' ? s.last?.picks[p.id] : null;
        c.font = '110px sans-serif';
        c.fillText(pick ? HAND[pick] : s.phase === 'pick' ? (p.picked ? '✅' : '🤔') : '✊', x, y);
        c.font = 'bold 28px "Baloo 2", sans-serif'; c.fillStyle = '#fff';
        c.fillText(String(p.name).slice(0, 14), x, y + 72);
      });
    });
  }

  function tickTimer() {
    if (!state) return;
    const left = Math.max(0, state.remainingMs - (Date.now() - receivedAt));
    const total = { count: state.countMs, pick: state.pickMs, result: state.resultMs }[state.phase] || 0;
    el('timer').style.width = total ? `${(left / total) * 100}%` : '0%';
    el('timer').classList.toggle('low', state.phase === 'pick' && left < 3000);
    const big = el('big');
    if (state.phase === 'count') {
      const sec = Math.max(1, Math.ceil(left / 1000));
      if (sec !== lastSec) { lastSec = sec; big.textContent = String(sec); big.classList.remove('pulse'); void big.offsetWidth; big.classList.add('pulse'); sound.play('tick'); }
    } else if (state.phase === 'pick') {
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) { lastSec = sec; big.textContent = `${sec}s`; big.classList.remove('pulse'); }
    } else { lastSec = -1; big.textContent = ''; }
  }

  const onState = (s) => {
    const prev = state;
    state = s; receivedAt = Date.now();
    if (prev?.round !== s.round || s.phase === 'idle') { if (s.phase !== 'result') myPick = null; }
    if (prev && prev.phase !== 'pick' && s.phase === 'pick') sound.play('start');
    if (prev && prev.phase !== 'result' && s.phase === 'result' && s.last) {
      const g = s.last.gains[store.selfId], l = s.last.losses[store.selfId];
      if (g !== undefined) sound.play(g > l ? 'win' : l > g ? 'wrong' : 'pop');
    }
    render();
  };

  return {
    title: '✊ Oẳn Tù Tì',
    open(view) {
      view3d = view; lastDraw = ''; myPick = null;
      root.hidden = false;
      socket.on('rps:state', onState);
      socket.emit('rps:sync');
      timer = setInterval(tickTimer, 100);
    },
    close() {
      root.hidden = true;
      socket.off('rps:state', onState);
      clearInterval(timer);
      view3d = null; state = null;
    },
  };
}
