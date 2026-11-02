// 🌤️ Vòm trời 3D: ngước camera lên là thấy thiên đỉnh, mặt trời/mặt trăng theo giờ, mây trôi, sao đêm.
// Rẻ: 1 khối cầu tô màu theo đỉnh (vertex color), mây là vài sprite, sao là 1 Points.
import * as THREE from 'three';
import { Q } from './quality.js';

const R = 160;

function softTex(draw, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const seg = Q.level === 'low' ? [24, 12] : [40, 20];
    const geo = new THREE.SphereGeometry(R, seg[0], seg[1]);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // mặt trời + quầng sáng, mặt trăng
    const glow = softTex((c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,200,.9)'); g.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); });
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#fff2c4', fog: false, depthWrite: false, transparent: true }));
    this.sun.scale.setScalar(34);
    const moonTex = softTex((c, s) => { c.fillStyle = '#f4f1e6'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.32, 0, 7); c.fill(); c.fillStyle = 'rgba(180,175,160,.5)'; for (const [x, y, r] of [[0.42, 0.4, 0.06], [0.58, 0.55, 0.05], [0.47, 0.62, 0.035]]) { c.beginPath(); c.arc(s * x, s * y, s * r, 0, 7); c.fill(); } });
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
    this.moon.scale.setScalar(16);
    this.group.add(this.sun, this.moon);

    // mây trôi
    const cloudTex = softTex((c, s) => {
      for (const [x, y, r] of [[0.3, 0.6, 0.22], [0.5, 0.5, 0.28], [0.7, 0.6, 0.2], [0.45, 0.65, 0.2], [0.6, 0.66, 0.18]]) {
        const g = c.createRadialGradient(s * x, s * y, 0, s * x, s * y, s * r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, s, s);
      }
    }, 256);
    this.clouds = new THREE.Group();
    const n = Q.level === 'low' ? 8 : 18;
    this.cloudMat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true, opacity: 0.85 });
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, el = 0.12 + Math.random() * 0.5, d = R * 0.85; // mây thấp gần chân trời → nhìn thấy được
      s.position.set(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
      s.scale.set(55 + Math.random() * 35, 22 + Math.random() * 12, 1);
      this.clouds.add(s);
    }
    this.group.add(this.clouds);

    // sao (bán cầu trên)
    const pts = [];
    for (let i = 0; i < (Q.level === 'low' ? 400 : 900); i++) {
      const a = Math.random() * Math.PI * 2, el = Math.asin(Math.random() * 0.98 + 0.02), d = R * 0.95;
      pts.push(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.group.add(this.stars);
    this.group.traverse((o) => { o.frustumCulled = false; });
  }

  /** stops: [đỉnh, giữa, chân trời] (THREE.Color); hour: giờ VN; night 0..1; cloudy 0..1 (mưa/tuyết). */
  set(stops, hour, night, cloudy = 0) {
    const pos = this.dome.geometry.attributes.position, col = this.dome.geometry.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / R; // -1..1
      if (y <= 0) c.copy(stops[2]);
      else if (y < 0.3) c.copy(stops[2]).lerp(stops[1], y / 0.3);
      else c.copy(stops[1]).lerp(stops[0], Math.min(1, (y - 0.3) / 0.5));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    // mặt trời mọc 6h hướng đông (+x), lặn 18h hướng tây; mặt trăng ngược lại
    const sunA = ((hour - 6) / 12) * Math.PI; // 0 lúc mọc, π lúc lặn
    const place = (o, a, d) => o.position.set(Math.cos(a) * d, Math.sin(a) * d, -0.35 * d);
    place(this.sun, sunA, R * 0.9);
    place(this.moon, sunA + Math.PI, R * 0.9);
    this.sun.visible = Math.sin(sunA) > -0.05 && cloudy < 0.5;
    this.moon.visible = night > 0.3 && cloudy < 0.5;
    this.sun.material.color.set(Math.sin(sunA) < 0.35 ? '#ffb36b' : '#fff2c4');
    this.stars.material.opacity = Math.max(0, night - 0.2) * (1 - cloudy) * 1.1;
    this.cloudMat.opacity = (0.55 + cloudy * 0.4) * (1 - night * 0.55);
    this.cloudMat.color.set(cloudy ? '#b9c2cc' : night > 0.5 ? '#5a6080' : '#ffffff');
  }

  update(dt, camPos) {
    this.group.position.copy(camPos);
    this.clouds.rotation.y += dt * 0.004;
  }
}
