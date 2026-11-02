// 🌦️ Thời tiết: mưa / tuyết / hoa đào rơi. Mỗi loại = 1 Points (1 lần vẽ), hạt bám quanh người chơi.
import * as THREE from 'three';
import { Q } from './quality.js';

const COUNT = { high: 2400, medium: 1400, low: 350 }[Q.level];
const THIN = Q.level === 'low' ? 0.6 : 1; // máy yếu: hạt nhỏ hơn → ít điểm ảnh phải tô
const BOX = { w: 44, h: 18, d: 44 };

function tex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  draw(c.getContext('2d'));
  return new THREE.CanvasTexture(c);
}
const TEX = {
  rain: () => tex((c) => { const g = c.createLinearGradient(32, 0, 32, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.9)'); c.fillStyle = g; c.fillRect(29, 0, 6, 64); }),
  snow: () => tex((c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }),
  sakura: () => tex((c) => { c.fillStyle = '#ffb7d0'; c.beginPath(); c.ellipse(32, 32, 22, 13, 0.6, 0, 7); c.fill(); c.fillStyle = '#ff8fb8'; c.beginPath(); c.ellipse(36, 30, 8, 4, 0.6, 0, 7); c.fill(); }),
};
const STYLE = {
  rain: { size: 0.55 * THIN, color: '#bcd8ff', opacity: 0.6, vy: -16, drift: 0.6, sway: 0 },
  snow: { size: 0.28 * THIN, color: '#ffffff', opacity: 0.95, vy: -1.3, drift: 0.2, sway: 0.6 },
  sakura: { size: 0.32 * THIN, color: '#ffffff', opacity: 0.95, vy: -0.9, drift: 0.9, sway: 0.8 },
};

export class Weather {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.systems = {};
    this.type = 'clear';
  }

  make(type) {
    const n = type === 'rain' ? COUNT : Math.round(COUNT * 0.55);
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * BOX.w; pos[i * 3 + 1] = Math.random() * BOX.h; pos[i * 3 + 2] = (Math.random() - 0.5) * BOX.d;
      seed[i] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const st = STYLE[type];
    const m = new THREE.PointsMaterial({ size: st.size, map: TEX[type](), color: st.color, transparent: true, opacity: st.opacity, depthWrite: false, fog: true });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    this.group.add(pts);
    return (this.systems[type] = { pts, seed, n, st });
  }

  set(type) {
    this.type = type;
    for (const [k, s] of Object.entries(this.systems)) s.pts.visible = k === type;
    if (type !== 'clear' && !this.systems[type]) this.make(type);
  }

  update(dt, t, center) {
    const s = this.systems[this.type];
    if (!s) return;
    this.group.position.set(center.x, 0, center.z);
    const p = s.pts.geometry.attributes.position.array, st = s.st;
    for (let i = 0; i < s.n; i++) {
      const k = i * 3;
      p[k + 1] += st.vy * dt;
      p[k] += (st.drift + Math.sin(t * 1.3 + s.seed[i]) * st.sway) * dt;
      p[k + 2] += Math.cos(t * 1.1 + s.seed[i]) * st.sway * dt;
      if (p[k + 1] < 0) { p[k + 1] += BOX.h; p[k] = (Math.random() - 0.5) * BOX.w; p[k + 2] = (Math.random() - 0.5) * BOX.d; }
      if (p[k] > BOX.w / 2) p[k] -= BOX.w;
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
  }
}
