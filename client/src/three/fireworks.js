// 🎆 Pháo hoa: mỗi chùm là 1 Points (1 lần vẽ), pool tái sử dụng → không tạo rác bộ nhớ.
import * as THREE from 'three';
import { Q } from './quality.js';

const PER = Q.level === 'low' ? 90 : 160;
const POOL = 6;

// hạt tròn có quầng sáng (thay vì ô vuông mặc định của Points)
let dot = null;
function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  const ctx = c.getContext('2d'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  return dot;
}

export class Fireworks {
  constructor(scene) {
    this.bursts = [];
    for (let i = 0; i < POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PER * 3), 3));
      const m = new THREE.PointsMaterial({ size: 0.5, map: dotTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const pts = new THREE.Points(geo, m);
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      this.bursts.push({ pts, vel: new Float32Array(PER * 3), t: 0, life: 0, phase: 'idle', from: new THREE.Vector3(), to: new THREE.Vector3() });
    }
  }

  /** Bắn 3 chùm quanh điểm (x, z), cách nhau một chút. */
  launch(x, z) {
    [0, 0.45, 0.9].forEach((delay, k) => setTimeout(() => this.one(x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 4, k), delay * 1000));
  }

  one(x, z) {
    const b = this.bursts.find((q) => q.phase === 'idle') || this.bursts.reduce((a, q) => (q.t > a.t ? q : a));
    b.phase = 'rise'; b.t = 0;
    b.from.set(x, 0.5, z); b.to.set(x, 5.5 + Math.random() * 2, z); // vừa tầm nhìn của camera
    b.pts.material.color.setHSL(Math.random(), 1, 0.45); // hơi tối để chồng nhiều hạt vẫn ra màu
    b.pts.material.opacity = 1;
    b.pts.material.size = 0.8;
    b.pts.visible = true;
    const pos = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < PER; i++) pos.set([x, 0.5, z], i * 3);
    b.pts.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (const b of this.bursts) {
      if (b.phase === 'idle') continue;
      b.t += dt;
      const pos = b.pts.geometry.attributes.position.array;
      if (b.phase === 'rise') {
        // tên lửa bay lên: mọi hạt chồng lên nhau thành 1 đốm sáng
        const p = Math.min(1, b.t / 0.8);
        const y = b.from.y + (b.to.y - b.from.y) * (1 - (1 - p) ** 2);
        for (let i = 0; i < PER; i++) { pos[i * 3] = b.to.x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = b.to.z; }
        if (p >= 1) {
          b.phase = 'burst'; b.t = 0; b.pts.material.size = 0.8;
          for (let i = 0; i < PER; i++) { // vận tốc đều trên mặt cầu
            const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = 5 + Math.random() * 3, r = Math.sqrt(1 - u * u);
            b.vel[i * 3] = r * Math.cos(a) * s; b.vel[i * 3 + 1] = u * s; b.vel[i * 3 + 2] = r * Math.sin(a) * s;
          }
        }
      } else {
        for (let i = 0; i < PER; i++) {
          b.vel[i * 3 + 1] -= 4 * dt; // trọng lực
          pos[i * 3] += b.vel[i * 3] * dt; pos[i * 3 + 1] += b.vel[i * 3 + 1] * dt; pos[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
          b.vel[i * 3] *= 0.985; b.vel[i * 3 + 2] *= 0.985;
        }
        b.pts.material.opacity = Math.max(0, 1 - (b.t / 2.6) ** 2); // sáng lâu rồi mới tắt dần
        if (b.t > 2.6) { b.phase = 'idle'; b.pts.visible = false; }
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}
