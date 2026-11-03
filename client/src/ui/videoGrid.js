// Lưới video/voice trên thanh phòng. Bấm vào ô để phóng to.
import { rtc } from '../net/rtc.js';
import { store } from '../store.js';

const $ = (id) => document.getElementById(id);
let audioCtx = null;
const meters = new Map(); // id -> { analyser, data, track }

function meterFor(id, stream) {
  const track = stream.getAudioTracks()[0];
  const m = meters.get(id);
  if (m?.track === track) return m;
  dropMeter(id);
  if (!track) return null;
  try {
    audioCtx ||= new AudioContext();
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const nm = { analyser, data: new Uint8Array(analyser.frequencyBinCount), track, src };
    meters.set(id, nm);
    return nm;
  } catch { return null; }
}

/** Ngắt nút âm thanh của người đã rời (không thì AudioContext giữ mãi). */
function dropMeter(id) {
  const m = meters.get(id);
  if (!m) return;
  try { m.src.disconnect(); } catch {}
  meters.delete(id);
}

function makeTile(id) {
  const tile = document.createElement('div');
  tile.className = 'rtc-tile';
  tile.dataset.id = id;
  tile.innerHTML = '<video autoplay playsinline></video><div class="avatar"></div><div class="tname"><span class="mic"></span><span class="n"></span></div>';
  // ô phóng to phải nổi trên khung chat & bảng điều khiển → nâng cả thanh phòng lên khi có ô to
  tile.onclick = () => { tile.classList.toggle('big'); document.body.classList.toggle('rtc-big', !!document.querySelector('.rtc-tile.big')); };
  return tile;
}

function render() {
  const box = $('rtc-tiles');
  const entries = [
    { id: 'me', name: `${store.players.get(store.selfId)?.name ?? 'Bạn'} (bạn)`, stream: rtc.local.stream, mic: !!rtc.local.mic, cam: !!rtc.local.cam, local: true },
    ...[...rtc.peers.values()].map((p) => ({
      id: p.id, name: store.players.get(p.id)?.name ?? '…', stream: p.stream,
      mic: p.media.mic, cam: p.media.cam, state: p.pc.connectionState,
    })),
  ];
  const keep = new Set(entries.map((e) => e.id));
  for (const t of [...box.children]) if (!keep.has(t.dataset.id)) t.remove();
  for (const id of [...meters.keys()]) if (!keep.has(id)) dropMeter(id);
  document.body.classList.toggle('rtc-big', !!box.querySelector('.rtc-tile.big'));

  for (const e of entries) {
    let tile = box.querySelector(`[data-id="${CSS.escape(e.id)}"]`);
    if (!tile) { tile = makeTile(e.id); box.append(tile); }
    const v = tile.querySelector('video');
    v.muted = !!e.local;
    if (v.srcObject !== e.stream) v.srcObject = e.stream;
    v.play?.().catch(() => {});
    tile.classList.toggle('has-video', e.cam && e.stream.getVideoTracks().length > 0);
    tile.classList.toggle('connecting', !e.local && (e.mic || e.cam) && e.state !== 'connected');
    tile.querySelector('.avatar').textContent = (e.name[0] || '?').toUpperCase();
    tile.querySelector('.n').textContent = e.name;
    tile.querySelector('.mic').textContent = e.mic ? '🎙️' : '🔇';
  }

  $('btn-mic').classList.toggle('off', !rtc.local.mic);
  $('btn-cam').classList.toggle('off', !rtc.local.cam);
}

export function initVideoGrid() {
  rtc.onChange(render);
  store.on('players-changed', render);

  const guard = (fn, what) => async () => {
    // Trình duyệt chỉ cho mic/cam trên HTTPS (hoặc localhost)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      alert(`Không bật được ${what} vì trang đang mở qua http://.\nMic/cam chỉ chạy trên HTTPS (bản deploy Render) hoặc trên chính máy chạy server (localhost).`);
      return;
    }
    try { await fn(); }
    catch (e) {
      console.warn(e);
      alert(`Không mở được ${what}. Hãy cho phép trình duyệt truy cập ${what} (biểu tượng 🔒 trên thanh địa chỉ).`);
    }
  };
  $('btn-mic').onclick = guard(() => rtc.toggleMic(), 'micro');
  $('btn-cam').onclick = guard(() => rtc.toggleCam(), 'camera');

  // Đèn "đang nói"
  setInterval(() => {
    const box = $('rtc-tiles');
    if (!box.children.length) return;
    for (const tile of box.children) {
      const id = tile.dataset.id;
      const stream = id === 'me' ? rtc.local.stream : rtc.peers.get(id)?.stream;
      const m = stream && meterFor(id, stream);
      let level = 0;
      if (m) {
        m.analyser.getByteFrequencyData(m.data);
        level = m.data.reduce((a, b) => a + b, 0) / m.data.length;
      }
      tile.classList.toggle('speaking', level > 18);
    }
    if (audioCtx?.state === 'suspended') audioCtx.resume();
  }, 150);
  render();
}
