// Âm thanh nhỏ tổng hợp bằng WebAudio – không cần file mp3.
let ctx = null;
let enabled = (() => { try { return localStorage.getItem('hoiquan.sound') !== 'off'; } catch { return true; } })();

function tone(freq, start, dur, type = 'sine', vol = 0.12) {
  ctx ||= new AudioContext();
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

const SOUNDS = {
  pop: () => tone(660, 0, 0.08, 'triangle', 0.08),
  message: () => { tone(880, 0, 0.07, 'sine', 0.06); tone(1175, 0.06, 0.09, 'sine', 0.05); },
  enter: () => { tone(523, 0, 0.1, 'triangle'); tone(784, 0.08, 0.15, 'triangle'); },
  leave: () => { tone(784, 0, 0.1, 'triangle'); tone(523, 0.08, 0.15, 'triangle'); },
  move: () => tone(440, 0, 0.06, 'square', 0.05),
  tick: () => tone(1000, 0, 0.04, 'square', 0.04),
  correct: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.15, 'triangle', 0.1)),
  wrong: () => { tone(220, 0, 0.18, 'sawtooth', 0.06); tone(180, 0.15, 0.25, 'sawtooth', 0.06); },
  win: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.11, 0.2, 'triangle', 0.12)),
  start: () => [392, 523, 659].forEach((f, i) => tone(f, i * 0.1, 0.14, 'triangle', 0.1)),
};

export const sound = {
  play(name) {
    if (!enabled) return;
    try { SOUNDS[name]?.(); } catch {}
  },
  get enabled() { return enabled; },
  toggle() {
    enabled = !enabled;
    try { localStorage.setItem('hoiquan.sound', enabled ? 'on' : 'off'); } catch {}
    return enabled;
  },
};
