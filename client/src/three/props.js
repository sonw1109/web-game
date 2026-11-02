// Texture vẽ bằng code + đạo cụ 3D dùng chung (bồ đoàn, nến, cây, đèn, nhà…).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat } from './avatar.js';
import { Q } from './quality.js';

export { mat };

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Tạo CanvasTexture lặp lại từ hàm vẽ. */
export function canvasTex(size, draw, repeat = [1, 1], aniso = 8) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  return t;
}

export const textures = {
  wood(repeat = [4, 4], base = '#5a3a26') {
    return canvasTex(512, (c, s) => {
      const r = rng(3);
      const rows = 8, h = s / rows;
      for (let i = 0; i < rows; i++) {
        const off = (i % 2) * s * 0.37;
        for (let x = -s; x < s * 2; x += s * 0.75) {
          const l = 0.85 + r() * 0.3;
          c.fillStyle = shadeCss(base, l);
          c.fillRect(x + off, i * h, s * 0.75, h);
          c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
          c.strokeRect(x + off, i * h, s * 0.75, h);
        }
        for (let k = 0; k < 30; k++) { // vân gỗ
          c.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; c.lineWidth = 1;
          const y = i * h + r() * h;
          c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.6, y + r() * 6 - 3, s, y); c.stroke();
        }
      }
    }, repeat);
  },
  grass(repeat = [12, 12]) {
    return canvasTex(256, (c, s) => {
      const r = rng(9);
      c.fillStyle = '#6aa84f'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = `hsla(${95 + r() * 25}, ${45 + r() * 20}%, ${32 + r() * 22}%, .6)`;
        c.fillRect(r() * s, r() * s, 1.5, 3 + r() * 3);
      }
    }, repeat);
  },
  carpet(base = '#7a1f1f', border = '#d9b65a') {
    return canvasTex(256, (c, s) => {
      c.fillStyle = base; c.fillRect(0, 0, s, s);
      c.strokeStyle = border; c.lineWidth = 14; c.strokeRect(14, 14, s - 28, s - 28);
      c.setLineDash([6, 8]); c.lineWidth = 3; c.strokeStyle = shadeCss(border, 0.7); c.strokeRect(30, 30, s - 60, s - 60);
      c.setLineDash([]);
      for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    }, [1, 1]);
  },
  plaster(base = '#6b3a2a', repeat = [3, 1]) {
    return canvasTex(256, (c, s) => {
      c.fillStyle = base; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.04})`; c.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    }, repeat);
  },
};

function shadeCss(hex, mul) {
  const c = new THREE.Color(hex).multiplyScalar(mul);
  return `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`;
}

const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// ---------------- Đạo cụ ----------------
/** Bồ đoàn (đệm ngồi) xếp nếp như ảnh mẫu, kèm thảm đỏ viền vàng. */
const CUSHION_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.42, 0.46, 0.16, 48, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z);
    if (v.y > 0) v.y += 0.05 * (1 - (rr / 0.42) ** 2); // phồng ở giữa
    const pleat = 1 + Math.sin(a * 24) * 0.02;
    v.x *= pleat; v.z *= pleat;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
})();
let carpetTex = null;
export function cushion({ withMat = true, color = '#a8794a' } = {}) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(CUSHION_GEO, mat(color, { roughness: 0.9 }));
  c.position.y = 0.09;
  g.add(c);
  if (withMat) {
    carpetTex ||= textures.carpet();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.005;
    g.add(m);
  }
  return shadowed(g);
}
export const CUSHION_SEAT_Y = 0.2;

export function candle(height = 0.45, withLight = Q.extraLights) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 16), mat('#b8892f', { metalness: 0.7, roughness: 0.3 }));
  base.position.y = 0.03;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, height, 16), mat('#fff6e0', { roughness: 0.5 }));
  body.position.y = 0.06 + height / 2;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffcf6b' }));
  flame.scale.y = 1.8; flame.position.y = 0.1 + height;
  g.add(base, body, flame);
  g.userData.flame = flame;
  if (withLight) {
    const l = new THREE.PointLight('#ffb35c', 1.4, 4, 2);
    l.position.y = 0.15 + height;
    g.add(l);
    g.userData.light = l;
  }
  shadowed(g);
  flame.castShadow = false;
  return g;
}
/** Nến lung linh. */
export function flicker(candleGroup, t, seed = 0) {
  const f = candleGroup.userData.flame, l = candleGroup.userData.light;
  const k = 1 + Math.sin(t * 13 + seed) * 0.08 + Math.sin(t * 7.3 + seed * 2) * 0.06;
  f.scale.set(1 / k, 1.8 * k, 1 / k);
  if (l) l.intensity = 1.3 * k;
}

export function tree(r = Math.random, scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.8, 7), mat('#6b4226'));
  trunk.position.y = 0.4;
  g.add(trunk);
  const greens = ['#3f8f3a', '#4ea446', '#357a35', '#5bb04f'];
  for (let i = 0; i < 3; i++) {
    const s = 0.55 - i * 0.12;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat(greens[(i + Math.floor(r() * 4)) % 4], { flatShading: true, roughness: 0.9 }));
    blob.position.set((r() - 0.5) * 0.15, 0.95 + i * 0.32, (r() - 0.5) * 0.15);
    g.add(blob);
  }
  g.scale.setScalar(scale);
  return shadowed(g);
}

export function lamp(withLight = Q.extraLights) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.7, 8), mat('#2b2d42', { metalness: 0.6, roughness: 0.4 }));
  post.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb347', emissiveIntensity: 1.6 }));
  head.position.y = 1.8;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), mat('#2b2d42'));
  cap.position.y = 2.0; cap.rotation.y = Math.PI / 4;
  g.add(post, head, cap);
  if (withLight) {
    const l = new THREE.PointLight('#ffb347', 6, 7, 2);
    l.position.y = 1.75;
    g.add(l);
  }
  shadowed(g);
  head.castShadow = false;
  return g;
}

export function bench() {
  const g = new THREE.Group();
  const wood = mat('#9c6a43');
  const seat = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.08, 0.4, 2, 0.03), wood);
  seat.position.y = 0.42;
  const back = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.3, 0.06, 2, 0.03), wood);
  back.position.set(0, 0.7, -0.18);
  g.add(seat, back);
  for (const x of [-0.55, 0.55]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.36), mat('#3b2b20'));
    leg.position.set(x, 0.21, 0);
    g.add(leg);
  }
  return shadowed(g);
}

/** Nhà mái ngói (đặt tâm ở giữa, cửa hướng +z). */
export function house({ w, d, wall, roof, door = '#6b3f22' }) {
  const g = new THREE.Group();
  const H = 2.1;
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, H, d, 2, 0.06), mat(wall, { roughness: 0.9 }));
  body.position.y = H / 2;
  g.add(body);
  // nền đá
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.18, d + 0.3), mat('#9a8f86'));
  base.position.y = 0.09;
  g.add(base);
  // mái 2 mái + cong nhẹ kiểu Á Đông
  const over = 0.45, rh = 1.3;
  const shape = new THREE.Shape();
  shape.moveTo(-(d / 2 + over), 0); shape.quadraticCurveTo(-d / 4, rh * 0.35, 0, rh);
  shape.quadraticCurveTo(d / 4, rh * 0.35, d / 2 + over, 0); shape.lineTo(-(d / 2 + over), 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + over * 2, bevelEnabled: false });
  roofGeo.translate(0, 0, -(w + over * 2) / 2);
  const roofMesh = new THREE.Mesh(roofGeo, mat(roof, { roughness: 0.7 }));
  roofMesh.rotation.y = Math.PI / 2;
  roofMesh.position.y = H;
  g.add(roofMesh);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, w + over * 2 + 0.2, 8), mat('#3b2b20'));
  ridge.rotation.z = Math.PI / 2; ridge.position.y = H + rh;
  g.add(ridge);
  // cửa + đèn lồng
  const doorMesh = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.45, 0.12, 2, 0.04), mat(door));
  doorMesh.position.set(0, 0.9, d / 2 + 0.02);
  g.add(doorMesh);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.15), new THREE.MeshBasicMaterial({ color: '#ffd28a', transparent: true, opacity: 0.0 }));
  glow.position.set(0, 0.85, d / 2 + 0.09);
  g.add(glow);
  for (const side of [-1, 1]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#ff4d2e', emissiveIntensity: 1.2 }));
    lantern.scale.y = 1.25; lantern.position.set(side * 0.75, 1.75, d / 2 + 0.25);
    g.add(lantern);
  }
  // cửa sổ sáng đèn
  const winMat = new THREE.MeshStandardMaterial({ color: '#ffe7a8', emissive: '#ffc965', emissiveIntensity: 0.9 });
  for (const x of [-w / 2 + 0.8, w / 2 - 0.8]) {
    if (w < 3) break;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.06), winMat);
    win.position.set(x, 1.25, d / 2 + 0.02);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.04), mat('#4a3426'));
    frame.position.set(x, 1.25, d / 2 + 0.005);
    g.add(frame, win);
  }
  if (Q.extraLights) {
    const l = new THREE.PointLight('#ffb36b', 3, 5, 2);
    l.position.set(0, 1.6, d / 2 + 0.8);
    g.add(l);
  }
  return shadowed(g);
}

export function fountain() {
  const g = new THREE.Group();
  const stone = mat('#a7a1a9', { roughness: 0.8 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.45, 0.4, 40, 1, true), stone);
  basin.position.y = 0.2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.09, 10, 48), stone);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.4;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), new THREE.MeshStandardMaterial({ color: '#3f9ad9', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.32;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.0, 16), stone);
  col.position.y = 0.6;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.16, 32), stone);
  top.position.y = 1.1;
  const topWater = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), water.material);
  topWater.rotation.x = -Math.PI / 2; topWater.position.y = 1.19;
  g.add(basin, rim, water, col, top, topWater);
  // tia nước
  const N = 48, seeds = Array.from({ length: N }, () => Math.random());
  const dropGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: '#cfeaff', size: 0.09, transparent: true, opacity: 0.85 }));
  drops.frustumCulled = false;
  g.add(drops);
  g.userData.animate = (t) => {
    for (let i = 0; i < N; i++) {
      const p = (seeds[i] + t * 0.6) % 1, r = 0.1 + p * 0.95, a = (i / N) * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 1.2 + Math.sin(p * Math.PI) * 0.7 - p * 0.75; pos[i * 3 + 2] = Math.sin(a) * r;
    }
    dropGeo.attributes.position.needsUpdate = true;
  };
  shadowed(g);
  water.receiveShadow = true;
  return g;
}

/** Nhãn chữ trên texture (biển hiệu, bảng điểm…). */
export function textCanvas(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const redraw = (...args) => { const c = cv.getContext('2d'); c.clearRect(0, 0, w, h); draw(c, w, h, ...args); tex.needsUpdate = true; };
  return { canvas: cv, tex, redraw };
}

/** Phòng kín cơ bản: sàn gỗ, 3 bức tường, trần tối. */
export function roomShell({ w = 14, d = 12, h = 5, floor = '#5a3a26', wall = '#6b3a2a' } = {}) {
  const g = new THREE.Group();
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: textures.wood([w / 3, d / 3], floor), roughness: 0.65 }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  g.add(fl);
  const wallMat = new THREE.MeshStandardMaterial({ map: textures.plaster(wall, [w / 4, h / 4]), roughness: 0.95 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  back.position.set(0, h / 2, -d / 2); back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.rotation.y = Math.PI / 2; left.position.set(-w / 2, h / 2, 0); left.receiveShadow = true;
  const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = w / 2;
  g.add(back, left, right);
  // chân tường gỗ
  const skirt = mat('#3a2418');
  for (const [geo, pos, ry] of [[new THREE.BoxGeometry(w, 0.3, 0.08), [0, 0.15, -d / 2 + 0.04], 0], [new THREE.BoxGeometry(d, 0.3, 0.08), [-w / 2 + 0.04, 0.15, 0], Math.PI / 2], [new THREE.BoxGeometry(d, 0.3, 0.08), [w / 2 - 0.04, 0.15, 0], Math.PI / 2]]) {
    const m = new THREE.Mesh(geo, skirt); m.position.set(...pos); m.rotation.y = ry; g.add(m);
  }
  return g;
}
