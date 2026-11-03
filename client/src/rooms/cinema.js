// 🎬 Rạp phim – YouTube IFrame API + đồng bộ qua server.
import { socket } from '../net/socket.js';
import { store } from '../store.js';

const DRIFT_LIMIT = 1.5; // giây
const $ = (id) => document.getElementById(id);
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

let ytReady = null;
/**
 * Tải YouTube IFrame API đúng 1 lần.
 * - API đã có sẵn (kể cả tải xong SAU lần hết giờ trước) → dùng luôn.
 * - Script đang tải dở → chờ tiếp chứ không chèn thêm script (YouTube chỉ gọi onYouTubeIframeAPIReady 1 lần).
 */
function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    const done = () => { clearInterval(poll); clearTimeout(timer); resolve(window.YT); };
    window.onYouTubeIframeAPIReady = done;
    const poll = setInterval(() => { if (window.YT?.Player) done(); }, 500);
    const fail = (msg) => { clearInterval(poll); clearTimeout(timer); ytReady = null; reject(new Error(msg)); };
    const timer = setTimeout(() => fail('YouTube tải quá lâu – thử vào lại phòng'), 15000);
    let s = document.querySelector('script[data-yt-api]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.dataset.ytApi = '1';
      s.onerror = () => { s.remove(); fail('Không tải được YouTube (mạng chặn?)'); };
      document.head.append(s);
    }
  });
  return ytReady;
}

export function createCinemaRoom() {
  const root = $('room-cinema');
  let player = null;          // YT.Player
  let playerReady = false;
  let state = null;           // trạng thái từ server
  let receivedAt = 0;
  let loadedUid = null;
  let seeking = false;
  let tickTimer = null;
  let playAttemptAt = 0;
  let unsubPlayers = null;

  // Livestream: thời gian tính từ lúc buổi live bắt đầu, không so với vị trí trên server được
  // → chỉ đồng bộ play/pause, mọi người xem ở "điểm trực tiếp" mới nhất.
  let liveJumpedUid = null;
  const isLive = () => !!(playerReady && player.getVideoData?.()?.isLive);
  const jumpToLiveEdge = () => { const d = player.getDuration?.(); if (d > 0) player.seekTo(d, true); };

  const expected = () => {
    if (!state?.current) return 0;
    return state.isPlaying ? state.position + (Date.now() - receivedAt) / 1000 : state.position;
  };

  // ---------- YouTube player ----------
  // Tạo player đúng 1 lần (vào lại phòng lúc YouTube đang tải không sinh ra player thứ 2)
  let playerPromise = null;
  function ensurePlayer() {
    playerPromise ||= createPlayer().catch((e) => { playerPromise = null; throw e; });
    return playerPromise;
  }
  async function createPlayer() {
    if (player) return;
    const YT = await loadYouTubeAPI();
    await new Promise((resolve) => {
      player = new YT.Player('yt-player', {
        width: '100%', height: '100%',
        playerVars: { controls: 0, disablekb: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0 },
        events: {
          onReady: () => { playerReady = true; player.setVolume(+$('cc-volume').value); resolve(); },
          onStateChange: onPlayerState,
          // Video bị xóa / riêng tư / chặn nhúng / live đã hết → báo và tự chuyển bài
          onError: (e) => {
            const cur = state?.current;
            if (!cur) return;
            $('cinema-click-play').hidden = true;
            const why = { 2: 'link lỗi', 5: 'không phát được', 100: 'video không còn', 101: 'chủ kênh chặn nhúng', 150: 'chủ kênh chặn nhúng' }[e.data] || 'lỗi';
            const err = $('cinema-error');
            err.textContent = `⚠️ "${cur.title}" không xem được (${why}) – tự chuyển bài…`;
            err.hidden = false;
            setTimeout(() => { if (state?.current?.uid === cur.uid) socket.emit('cinema:ended', cur.uid); }, 3000);
          },
        },
      });
    });
  }

  function onPlayerState(e) {
    const YT = window.YT;
    if (e.data === YT.PlayerState.ENDED && state?.current) {
      socket.emit('cinema:ended', state.current.uid);
    }
    if (e.data === YT.PlayerState.PLAYING) {
      $('cinema-click-play').hidden = true;
      if (state && !state.isPlaying) player.pauseVideo();
      else if (isLive() && liveJumpedUid !== loadedUid) { liveJumpedUid = loadedUid; jumpToLiveEdge(); }
    }
  }

  // ---------- Áp trạng thái server vào player ----------
  function apply() {
    renderSide();
    const cur = state?.current;
    $('cinema-empty').hidden = !!cur;
    $('cc-play').textContent = state?.isPlaying ? '⏸' : '▶';
    if (!playerReady) return;
    const YT = window.YT;

    if (!cur) {
      if (loadedUid !== null) { player.stopVideo(); loadedUid = null; }
      return;
    }
    if (cur.uid !== loadedUid) {
      loadedUid = cur.uid;
      $('cinema-error').hidden = true;
      player.loadVideoById({ videoId: cur.videoId, startSeconds: expected() });
      playAttemptAt = Date.now();
      if (!state.isPlaying) setTimeout(() => { if (!state.isPlaying) player.pauseVideo(); }, 800);
      return;
    }
    const ps = player.getPlayerState();
    if (state.isPlaying && ps !== YT.PlayerState.PLAYING && ps !== YT.PlayerState.BUFFERING) {
      player.playVideo();
      playAttemptAt = Date.now();
    }
    if (!state.isPlaying && ps === YT.PlayerState.PLAYING) player.pauseVideo();
    correctDrift(true);
  }

  function correctDrift(force = false) {
    if (!playerReady || !state?.current || loadedUid !== state.current.uid || isLive()) return;
    const diff = Math.abs(player.getCurrentTime() - expected());
    if (diff > DRIFT_LIMIT || (force && !state.isPlaying && diff > 0.3)) player.seekTo(expected(), true);
  }

  function tick() {
    if (!playerReady) return;
    const YT = window.YT;
    const dur = player.getDuration?.() || 0;
    const cur = state?.current ? player.getCurrentTime() : 0;
    const live = isLive();
    $('cc-time').textContent = live ? '🔴 TRỰC TIẾP' : `${fmt(cur)} / ${fmt(dur)}`;
    $('cc-time').classList.toggle('live', live);
    $('cc-seek').disabled = live;
    if (live) { $('cc-seek').max = 1; $('cc-seek').value = 1; }
    else if (!seeking) { $('cc-seek').max = dur || 100; $('cc-seek').value = cur; }
    correctDrift();
    // Trình duyệt chặn tự phát → cần người dùng bấm
    const ps = player.getPlayerState();
    const stuck = state?.isPlaying && state.current && Date.now() - playAttemptAt > 2500 && $('cinema-error').hidden
      && ps !== YT.PlayerState.PLAYING && ps !== YT.PlayerState.BUFFERING;
    $('cinema-click-play').hidden = !stuck;
    if (stuck && ps !== YT.PlayerState.UNSTARTED) { player.playVideo(); }
  }

  // ---------- UI bên phải ----------
  const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  function renderSide() {
    const now = $('cinema-now');
    if (state?.current) {
      now.classList.remove('muted');
      now.replaceChildren();
      const t = document.createElement('div'); t.textContent = state.current.title;
      const by = document.createElement('div'); by.className = 'by'; by.textContent = `thêm bởi ${state.current.by}`;
      now.append(t, by);
    } else { now.classList.add('muted'); now.textContent = '—'; }

    const q = $('cinema-queue');
    q.replaceChildren();
    for (const item of state?.queue || []) {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.src = thumb(item.videoId); img.alt = '';
      const info = document.createElement('div'); info.className = 'info';
      const t = document.createElement('div'); t.className = 'title'; t.textContent = item.title; t.title = item.title;
      const by = document.createElement('div'); by.className = 'by'; by.textContent = item.by;
      info.append(t, by);
      const act = document.createElement('div'); act.className = 'actions';
      const playBtn = document.createElement('button'); playBtn.textContent = '▶'; playBtn.title = 'Chiếu ngay';
      playBtn.onclick = () => socket.emit('cinema:playNow', item.uid);
      const rmBtn = document.createElement('button'); rmBtn.textContent = '✕'; rmBtn.title = 'Xóa';
      rmBtn.onclick = () => socket.emit('cinema:remove', item.uid);
      act.append(playBtn, rmBtn);
      li.append(img, info, act);
      q.append(li);
    }
    $('cinema-queue-count').textContent = state?.queue?.length ? `(${state.queue.length})` : '';
  }

  function renderViewers() {
    const ul = $('cinema-viewers');
    ul.replaceChildren();
    for (const p of store.inRoom('cinema')) {
      const li = document.createElement('li');
      li.textContent = p.id === store.selfId ? `${p.name} (bạn)` : p.name;
      ul.append(li);
    }
  }

  // ---------- Sự kiện điều khiển ----------
  let view3d = null;
  const onState = (s) => { state = s; receivedAt = Date.now(); apply(); view3d?.setPlaying(!!(s.current && s.isPlaying)); };

  $('cc-play').onclick = () => {
    if (!state?.current || !playerReady) return;
    const pos = player.getCurrentTime();
    socket.emit(state.isPlaying ? 'cinema:pause' : 'cinema:play', pos);
  };
  $('cc-next').onclick = () => socket.emit('cinema:next');
  $('cc-seek').addEventListener('input', () => { seeking = true; $('cc-time').textContent = `${fmt($('cc-seek').value)} / ${fmt(player?.getDuration?.())}`; });
  $('cc-seek').addEventListener('change', () => { seeking = false; socket.emit('cinema:seek', +$('cc-seek').value); });
  $('cc-volume').addEventListener('input', () => player?.setVolume?.(+$('cc-volume').value));
  $('cc-full').onclick = () => {
    const el = $('cinema-screen');
    if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.();
  };
  $('yt-shield').ondblclick = () => $('cc-full').click();
  $('yt-shield').onclick = () => $('cc-play').click();
  $('cinema-click-play').onclick = () => { player?.playVideo(); playAttemptAt = Date.now(); };

  $('cinema-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('cinema-url').value.trim();
    if (!url) return;
    const err = $('cinema-error');
    err.hidden = true;
    socket.emit('cinema:add', url, (res) => {
      if (res?.error) { err.textContent = res.error; err.hidden = false; }
      else $('cinema-url').value = '';
    });
  });

  const onKey = (e) => {
    // Đang focus ô nhập hoặc nút (Space sẽ tự bấm nút đó) → bỏ qua để không bị bấm 2 lần
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('cc-play').click(); }
  };
  let openToken = 0;

  return {
    title: '🎬 Rạp Hội Quán',
    async open(view) {
      view3d = view;
      view?.attachScreen($('cinema-screen'));
      root.hidden = false;
      document.body.classList.add('in-room');
      socket.on('cinema:state', onState);
      unsubPlayers = store.on('players-changed', renderViewers);
      window.addEventListener('keydown', onKey);
      renderViewers();
      const token = ++openToken;
      try { await ensurePlayer(); }
      catch (e) { $('cinema-error').textContent = `⚠️ ${e.message}`; $('cinema-error').hidden = false; }
      if (token !== openToken) return; // đã rời phòng trong lúc chờ YouTube tải
      socket.emit('cinema:sync');
      clearInterval(tickTimer);
      tickTimer = setInterval(tick, 1000);
    },
    close() {
      openToken++;
      root.hidden = true;
      view3d?.setPlaying(false);
      view3d?.detachScreen();
      view3d = null;
      document.body.classList.remove('in-room');
      socket.off('cinema:state', onState);
      unsubPlayers?.();
      window.removeEventListener('keydown', onKey);
      clearInterval(tickTimer);
      if (playerReady) { player.stopVideo(); }
      loadedUid = null;
      state = null;
    },
  };
}
