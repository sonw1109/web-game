// 🎙️ Voice/Video WebRTC mesh: mỗi người nối thẳng với từng người cùng phòng.
// Dùng pattern "perfect negotiation" để 2 bên cùng gửi offer không bị xung đột.
import { socket } from './socket.js';
import { store } from '../store.js';

let iceConfig = null;
async function getIce() {
  if (iceConfig) return iceConfig;
  try { iceConfig = await (await fetch('/api/ice')).json(); }
  catch { iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }; }
  return iceConfig;
}

/** @type {Map<string, Peer>} */
const peers = new Map();
const local = { stream: new MediaStream(), mic: null, cam: null };
let room = null;
let unsub = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

class Peer {
  constructor(id, config) {
    this.id = id;
    this.polite = store.selfId < id;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.stream = new MediaStream();
    this.media = { mic: false, cam: false };
    this.senders = { audio: null, video: null };
    const pc = (this.pc = new RTCPeerConnection(config));

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ description: pc.localDescription });
      } catch (e) { console.warn('[rtc] offer', e); }
      finally { this.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.send({ candidate });
    pc.ontrack = ({ track }) => {
      this.stream.getTracks().filter((t) => t.kind === track.kind).forEach((t) => this.stream.removeTrack(t));
      this.stream.addTrack(track);
      notify();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      notify();
    };
    if (local.mic) this.setTrack('audio', local.mic);
    if (local.cam) this.setTrack('video', local.cam);
  }

  send(data) { socket.emit('rtc:signal', { to: this.id, data }); }

  async setTrack(kind, track) {
    const sender = this.senders[kind];
    if (sender) await sender.replaceTrack(track);
    else if (track) this.senders[kind] = this.pc.addTrack(track, local.stream);
  }

  async onSignal({ description, candidate }) {
    const pc = this.pc;
    try {
      if (description) {
        const collision = description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.send({ description: pc.localDescription });
        }
      } else if (candidate) {
        try { await pc.addIceCandidate(candidate); }
        catch (e) { if (!this.ignoreOffer) throw e; }
      }
    } catch (e) { console.warn('[rtc] signal', e); }
  }

  close() { this.pc.close(); }
}

async function ensurePeer(id) {
  if (peers.has(id)) return peers.get(id);
  const p = new Peer(id, await getIce());
  if (peers.has(id)) { p.close(); return peers.get(id); } // tạo trùng trong lúc chờ fetch
  peers.set(id, p);
  notify();
  return p;
}

function closePeer(id) {
  peers.get(id)?.close();
  peers.delete(id);
  notify();
}

/** Đồng bộ danh sách peer với người đang ở cùng phòng. */
function syncMembers() {
  if (!room) return;
  const ids = new Set(store.inRoom(room).filter((p) => !p.bot && p.id !== store.selfId).map((p) => p.id));
  let added = false;
  for (const id of ids) if (!peers.has(id)) { ensurePeer(id); added = true; }
  for (const id of [...peers.keys()]) if (!ids.has(id)) closePeer(id);
  if (added) announceMedia();
}

const announceMedia = () => socket.emit('rtc:media', { mic: !!local.mic, cam: !!local.cam });

const onSignal = async ({ from, data }) => {
  if (!room) return;
  const p = await ensurePeer(from);
  p.onSignal(data);
};
const onMedia = ({ id, mic, cam }) => {
  const p = peers.get(id);
  if (p) { p.media = { mic, cam }; notify(); }
};

async function setLocal(kind, track) {
  const key = kind === 'audio' ? 'mic' : 'cam';
  const old = local[key];
  if (old) { old.stop(); local.stream.removeTrack(old); }
  local[key] = track;
  if (track) local.stream.addTrack(track);
  await Promise.all([...peers.values()].map((p) => p.setTrack(kind, track)));
  announceMedia();
  notify();
}

export const rtc = {
  peers, local,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  join(roomId) {
    this.leave();
    room = roomId;
    socket.on('rtc:signal', onSignal);
    socket.on('rtc:media', onMedia);
    unsub = store.on('players-changed', syncMembers);
    syncMembers();
  },

  leave() {
    if (!room) return;
    room = null;
    socket.off('rtc:signal', onSignal);
    socket.off('rtc:media', onMedia);
    unsub?.();
    for (const id of [...peers.keys()]) closePeer(id);
    // tắt mic/cam khi rời phòng (mặc định tắt khi vào phòng mới)
    for (const k of ['mic', 'cam']) if (local[k]) { local[k].stop(); local.stream.removeTrack(local[k]); local[k] = null; }
    notify();
  },

  async toggleMic() {
    if (local.mic) return setLocal('audio', null);
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!room) { s.getTracks().forEach((t) => t.stop()); return; }
    await setLocal('audio', s.getAudioTracks()[0]);
  },

  async toggleCam() {
    if (local.cam) return setLocal('video', null);
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { max: 20 } } });
    if (!room) { s.getTracks().forEach((t) => t.stop()); return; }
    await setLocal('video', s.getVideoTracks()[0]);
  },
};
