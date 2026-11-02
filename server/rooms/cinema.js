// 🎬 Rạp phim: playlist YouTube + đồng bộ play/pause/tua.
// Logic thuần (testable) tách khỏi phần socket.

import { reply, rateLimiter } from '../world.js';
const addLimit = rateLimiter(3, 5000);

const MAX_QUEUE = 50;

export function parseYouTubeId(input) {
  const s = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function createCinema(now = Date.now) {
  const s = {
    queue: [],            // [{ uid, videoId, title, by }]
    current: null,        // { uid, videoId, title, by }
    isPlaying: false,
    position: 0,          // giây, tại thời điểm updatedAt
    updatedAt: now(),
  };
  let uidSeq = 1;

  const positionNow = () =>
    s.isPlaying ? s.position + (now() - s.updatedAt) / 1000 : s.position;

  const setPos = (pos, playing) => {
    s.position = Math.max(0, Number.isFinite(pos) ? pos : positionNow());
    s.isPlaying = playing;
    s.updatedAt = now();
  };

  return {
    state: () => ({ ...s, position: positionNow(), updatedAt: now(), serverNow: now() }),
    positionNow,
    add(videoId, title, by) {
      if (s.queue.length >= MAX_QUEUE) return false;
      const item = { uid: uidSeq++, videoId, title: title || videoId, by };
      if (!s.current) { s.current = item; setPos(0, true); }
      else s.queue.push(item);
      return true;
    },
    play(pos) { if (s.current) setPos(pos, true); },
    pause(pos) { if (s.current) setPos(pos, false); },
    seek(pos) { if (s.current) setPos(pos, s.isPlaying); },
    next() {
      s.current = s.queue.shift() || null;
      setPos(0, !!s.current);
    },
    /** Chỉ chuyển bài nếu video đang phát đúng là video vừa kết thúc (tránh nhiều client cùng báo). */
    ended(uid) { if (s.current?.uid === uid) this.next(); },
    remove(uid) { s.queue = s.queue.filter((q) => q.uid !== uid); },
    playNow(uid) {
      const i = s.queue.findIndex((q) => q.uid === uid);
      if (i < 0) return;
      const [item] = s.queue.splice(i, 1);
      s.current = item;
      setPos(0, true);
    },
    freeze() { if (s.isPlaying) setPos(positionNow(), false); },
  };
}

async function fetchTitle(videoId) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${videoId}`,
      { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return (await r.json()).title?.slice(0, 120) || null;
  } catch { return null; }
}

export function registerCinema(io, world) {
  const cinema = createCinema();
  const ROOM = 'room:cinema';
  const broadcast = () => io.to(ROOM).emit('cinema:state', cinema.state());
  const inCinema = (socket) => world.get(socket.id)?.room === 'cinema';
  const pos = (v) => (Number.isFinite(+v) ? +v : undefined);

  const pauseIfEmpty = () => {
    if (world.inRoom('cinema').length === 0) cinema.freeze();
  };

  io.on('connection', (socket) => {
    const guard = (fn) => (...args) => { if (inCinema(socket)) { fn(...args); broadcast(); } };

    socket.on('cinema:sync', () => { if (inCinema(socket)) socket.emit('cinema:state', cinema.state()); });

    socket.on('cinema:add', async (url, ack) => {
      if (!inCinema(socket)) return;
      if (!addLimit(socket.id)) return reply(ack, { error: 'Thêm chậm lại chút nhé' });
      const videoId = parseYouTubeId(url);
      if (!videoId) return reply(ack, { error: 'Link YouTube không hợp lệ' });
      const title = await fetchTitle(videoId);
      const who = world.get(socket.id)?.name || '?';
      if (!cinema.add(videoId, title, who)) return reply(ack, { error: 'Hàng chờ đầy rồi' });
      reply(ack, { ok: true });
      broadcast();
      io.to(ROOM).emit('chat:message', { system: true, text: `🎬 ${who} thêm: ${title || videoId}`, ts: Date.now() });
    });

    socket.on('cinema:play', guard((p) => cinema.play(pos(p))));
    socket.on('cinema:pause', guard((p) => cinema.pause(pos(p))));
    socket.on('cinema:seek', guard((p) => cinema.seek(pos(p))));
    socket.on('cinema:next', guard(() => cinema.next()));
    socket.on('cinema:ended', guard((uid) => cinema.ended(uid)));
    socket.on('cinema:remove', guard((uid) => cinema.remove(uid)));
    socket.on('cinema:playNow', guard((uid) => cinema.playNow(uid)));

    // Handler của world đăng ký trước nên đã cập nhật p.room khi chạy tới đây
    socket.on('world:setRoom', pauseIfEmpty);
    socket.on('disconnect', pauseIfEmpty);
  });

  return cinema;
}
