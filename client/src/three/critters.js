// 🦆 Động vật quanh Hội Quán: vịt bơi trên hồ (có đàn vịt con lẽo đẽo theo mẹ), gà mái mổ thóc,
// cún chạy quanh đài phun nước, mèo ngủ trong chòi, thỏ nhảy trong vườn đào, trâu gặm cỏ ngoài đồng, bướm bay.
// Đường đi tính từ đồng hồ (không cần gửi qua mạng) → mọi người thấy con vật ở cùng chỗ.
// Mỗi con gộp thành 1 khối (1 lần vẽ) để không tụt FPS.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from './avatar.js';
import { buildPet } from './pet.js';
import { PLAZA, GAZEBO } from '../game/map.js';

const S = new THREE.SphereGeometry(1, 12, 9), C = new THREE.ConeGeometry(1, 1, 8), B = new THREE.BoxGeometry(1, 1, 1), CY = new THREE.CylinderGeometry(1, 1, 1, 8);
function part(g, geo, color, [x, y, z], [sx, sy, sz], rot) {
  const o = new THREE.Mesh(geo, mat(color));
  o.position.set(x, y, z); o.scale.set(sx, sy, sz);
  if (rot) o.rotation.set(...rot);
  g.add(o);
  return o;
}
const eyes = (g, y, z, dx) => { for (const s of [-1, 1]) part(g, S, '#1d1820', [s * dx, y, z], [0.02, 0.026, 0.02]); };

function duck(baby) {
  const g = new THREE.Group();
  const body = baby ? '#ffe066' : '#fbfbf7', beak = '#ff9f1c';
  part(g, S, body, [0, 0.13, 0], [0.17, 0.12, 0.24]);
  part(g, S, body, [0, 0.15, -0.2], [0.07, 0.08, 0.08], [-0.6, 0, 0]); // đuôi vểnh
  part(g, S, body, [0, 0.32, 0.15], [0.1, 0.1, 0.1]);
  part(g, B, beak, [0, 0.3, 0.27], [0.07, 0.03, 0.08]);
  eyes(g, 0.35, 0.23, 0.055);
  if (!baby) for (const s of [-1, 1]) part(g, S, '#e8e6dc', [s * 0.15, 0.15, -0.02], [0.03, 0.08, 0.16]);
  if (baby) g.scale.setScalar(0.55);
  return g;
}
function hen() {
  const g = new THREE.Group();
  part(g, S, '#f4efe6', [0, 0.22, 0], [0.16, 0.15, 0.2]);
  part(g, S, '#c58b4c', [0, 0.3, -0.18], [0.06, 0.12, 0.08], [-0.5, 0, 0]);
  part(g, S, '#f4efe6', [0, 0.4, 0.13], [0.09, 0.1, 0.09]);
  part(g, B, '#e63946', [0, 0.51, 0.13], [0.03, 0.06, 0.1]); // mào
  part(g, S, '#e63946', [0, 0.33, 0.2], [0.025, 0.04, 0.02]); // yếm
  part(g, C, '#ffb703', [0, 0.39, 0.23], [0.03, 0.06, 0.03], [Math.PI / 2, 0, 0]);
  eyes(g, 0.43, 0.2, 0.05);
  for (const s of [-1, 1]) part(g, CY, '#ffb703', [s * 0.06, 0.05, 0], [0.015, 0.1, 0.015]);
  return g;
}
function buffalo() {
  const g = new THREE.Group();
  const hide = '#4a4a52', dark = '#2f2f36';
  part(g, S, hide, [0, 0.75, 0], [0.42, 0.36, 0.72]);
  part(g, S, hide, [0, 0.82, 0.72], [0.24, 0.24, 0.3]);
  part(g, S, '#6d6d74', [0, 0.72, 0.98], [0.15, 0.12, 0.1]);
  for (const s of [-1, 1]) {
    part(g, C, '#e8e0cf', [s * 0.3, 1.02, 0.66], [0.06, 0.34, 0.06], [0.3, 0, -s * 1.15]); // sừng cong
    part(g, S, dark, [s * 0.24, 0.92, 0.6], [0.09, 0.04, 0.06]);
  }
  eyes(g, 0.9, 0.95, 0.12);
  for (const [x, z] of [[-0.24, 0.42], [0.24, 0.42], [-0.24, -0.42], [0.24, -0.42]]) part(g, CY, dark, [x, 0.25, z], [0.1, 0.5, 0.1]);
  part(g, CY, dark, [0, 0.72, -0.72], [0.025, 0.45, 0.025], [0.5, 0, 0]); // đuôi
  return g;
}

/** Gộp cả nhóm thành 1 khối dùng màu theo đỉnh → 1 lần vẽ. */
function bake(group, scale = 1) {
  group.scale.multiplyScalar(scale);
  group.updateMatrixWorld(true);
  const geos = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const c = o.material.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    geos.push(g);
  });
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return merged;
}

// ---------- đường đi tất định theo thời gian ----------
function hash(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b % 1e6) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const smooth = (u) => u * u * (3 - 2 * u);

/**
 * kind, name, sound, scale, range (khoảng cách vuốt ve được)
 * rect: [x, z, w, h] khu đi lại · ring: chạy vòng quanh đài phun nước · fixed: đứng yên · follow: đi sau con số …
 */
const DEFS = [
  { kind: 'duck', name: 'Vịt mẹ', icon: '🦆', sound: 'quack', rect: [45, 21, 4.2, 7], water: true, speed: 0.55, seg: 7, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 0.45, water: true, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 0.9, water: true, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 1.35, water: true, range: 2.6 },
  { kind: 'duck', name: 'Vịt bầu', icon: '🦆', sound: 'quack', rect: [53, 21, 4.2, 7], water: true, speed: 0.5, seg: 8, range: 2.6 },
  { kind: 'duck', name: 'Vịt cỏ', icon: '🦆', sound: 'quack', rect: [2.7, 9.7, 3.6, 2.6], water: true, speed: 0.35, seg: 9, range: 2.4 },
  { kind: 'hen', name: 'Gà mái', icon: '🐔', sound: 'cluck', rect: [39, 37, 6, 5], speed: 0.9, seg: 5, range: 1.5 },
  { kind: 'hen', name: 'Gà mái', icon: '🐔', sound: 'cluck', rect: [39, 37, 6, 5], speed: 0.8, seg: 6, range: 1.5 },
  { kind: 'chick', name: 'Gà con', icon: '🐤', sound: 'peep', follow: 6, lag: 0.7, range: 1.4 },
  { kind: 'dog', name: 'Cún Vàng', icon: '🐶', sound: 'woof', ring: true, speed: 1.6, seg: 6, range: 1.5 },
  { kind: 'cat', name: 'Mèo Mướp', icon: '🐱', sound: 'meow', fixed: [GAZEBO.x + 1.2, 0.25, GAZEBO.y + 0.2, -1.2], sleep: true, range: 1.6 },
  { kind: 'bunny', name: 'Thỏ Bông', icon: '🐰', sound: 'squeak', rect: [47.5, 9.8, 4.5, 3], speed: 1.1, seg: 5, hop: true, range: 1.4 },
  { kind: 'bunny', name: 'Thỏ Ngọc', icon: '🐰', sound: 'squeak', rect: [56, 9.8, 4.5, 3], speed: 1.1, seg: 6, hop: true, range: 1.4 },
  { kind: 'buffalo', name: 'Trâu Đen', icon: '🐃', sound: 'moo', rect: [3, 27.5, 6, 4], speed: 0.35, seg: 12, range: 2.2 },
];

const MODELS = {
  duck: () => duck(false), duckling: () => duck(true), hen, buffalo,
  chick: () => buildPet('chick'), dog: () => buildPet('dog'), cat: () => buildPet('cat'), bunny: () => buildPet('bunny'),
};

export class Critters {
  constructor(scene) {
    this.scene = scene;
    const material = mat('#ffffff', { vertexColors: true });
    const geos = {};
    this.list = DEFS.map((d, i) => {
      geos[d.kind] ||= bake(MODELS[d.kind](), d.kind === 'cat' || d.kind === 'dog' ? 1.2 : 1);
      const mesh = new THREE.Mesh(geos[d.kind], material);
      mesh.castShadow = true;
      mesh.userData.keepMaterial = true;
      mesh.userData.critter = i;
      const root = new THREE.Group();
      root.add(mesh);
      scene.add(root);
      return { ...d, i, root, mesh, seed: i * 7919 + 13, reactT: 0, rot: 0, moving: false, x: 0, z: 0 };
    });
    this.butterflies = this.buildButterflies();
  }

  /** Vị trí + hướng + đang đi? của con thứ i tại thời điểm t (giây). */
  at(d, t) {
    if (d.fixed) return { x: d.fixed[0], z: d.fixed[2], rot: d.fixed[3], moving: false };
    if (d.follow != null) {
      const lead = this.list[d.follow], p = this.at(lead, t - d.lag), q = this.at(lead, t - d.lag - 0.15);
      const moving = Math.hypot(p.x - q.x, p.z - q.z) > 0.01;
      const rot = moving ? Math.atan2(p.x - q.x, p.z - q.z) : p.rot;
      // xếp hàng sau lưng (khi mẹ dừng lại thì con không chồng lên nhau)
      const sp = d.lag * 0.75; // ~0.35m mỗi con
      return { x: p.x - Math.sin(rot) * sp, z: p.z - Math.cos(rot) * sp, rot, moving };
    }
    const T = d.seg, k = Math.floor(t / T), u = t - k * T;
    const P = (n) => {
      if (d.ring) { const a = n * 0.8 + Math.sin(n * 1.3 + d.seed) * 0.6, r = 8.4 + hash(d.seed, n) * 0.8; return [PLAZA.x + Math.cos(a) * r, PLAZA.z + Math.sin(a) * r]; }
      const [x, z, w, h] = d.rect;
      return [x + hash(d.seed, n * 2) * w, z + hash(d.seed, n * 2 + 1) * h];
    };
    const A = P(k), Bp = P(k + 1);
    const dist = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
    const travel = Math.min(T * 0.75, dist / d.speed);
    const rot = Math.atan2(Bp[0] - A[0], Bp[1] - A[1]);
    if (u >= travel) return { x: Bp[0], z: Bp[1], rot, moving: false };
    let f = smooth(u / travel);
    if (d.ring) { // vòng quanh: nội suy theo góc để không cắt ngang đài phun nước
      const a0 = Math.atan2(A[1] - PLAZA.z, A[0] - PLAZA.x), r0 = Math.hypot(A[0] - PLAZA.x, A[1] - PLAZA.z);
      let a1 = Math.atan2(Bp[1] - PLAZA.z, Bp[0] - PLAZA.x); const r1 = Math.hypot(Bp[0] - PLAZA.x, Bp[1] - PLAZA.z);
      a1 = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      const a = a0 + (a1 - a0) * f, r = r0 + (r1 - r0) * f, dir = Math.sign(a1 - a0) || 1;
      return { x: PLAZA.x + Math.cos(a) * r, z: PLAZA.z + Math.sin(a) * r, rot: Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), moving: true };
    }
    return { x: A[0] + (Bp[0] - A[0]) * f, z: A[1] + (Bp[1] - A[1]) * f, rot, moving: true };
  }

  /** Được vuốt ve → nhảy cẫng + xoay. */
  react(i) { const c = this.list[i]; if (c) c.reactT = 1.4; }

  update(dt, t, near) {
    const now = Date.now() / 1000;
    for (const c of this.list) {
      const p = this.at(c, now);
      c.x = p.x; c.z = p.z; c.moving = p.moving;
      // ở xa người chơi → chỉ cập nhật vị trí, bỏ qua hoạt hình
      const far = Math.abs(p.x - near.x) > 30 || Math.abs(p.z - near.z) > 30;
      const r = c.root;
      r.position.set(p.x, c.fixed ? c.fixed[1] : 0, p.z);
      if (far) { r.rotation.y = p.rot; continue; }
      let d = p.rot - c.rot; d = Math.atan2(Math.sin(d), Math.cos(d));
      c.rot += d * Math.min(1, dt * 6);
      r.rotation.set(0, c.rot, 0);
      const m = c.mesh, ph = t * (c.kind === 'buffalo' ? 3 : 9) + c.i;
      m.position.y = 0; m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      if (c.water) { m.position.y = -0.04 + Math.sin(t * 2 + c.i) * 0.012; if (p.moving) m.rotation.z = Math.sin(ph) * 0.08; }
      else if (c.hop) { if (p.moving) m.position.y = Math.abs(Math.sin(ph * 0.9)) * 0.22; }
      else if (c.sleep && c.reactT <= 0) { m.scale.set(1, 0.72 + Math.sin(t * 1.8) * 0.03, 1.05); m.position.y = -0.04; }
      else if (p.moving) { m.position.y = Math.abs(Math.sin(ph)) * (c.kind === 'buffalo' ? 0.03 : 0.06); m.rotation.z = Math.sin(ph) * 0.05; }
      else if (c.kind === 'hen' || c.kind === 'chick') m.rotation.x = Math.max(0, Math.sin(t * 5 + c.i * 2)) * 0.6; // mổ thóc
      else if (c.kind === 'buffalo') m.rotation.x = 0.08 + Math.sin(t * 0.8) * 0.04; // cúi gặm cỏ
      if (c.reactT > 0) {
        c.reactT -= dt;
        const k = 1 - c.reactT / 1.4;
        m.position.y += Math.abs(Math.sin(k * Math.PI * 3)) * (c.kind === 'buffalo' ? 0.12 : 0.3) * (1 - k);
        m.rotation.y = Math.sin(k * Math.PI * 2) * 0.6;
      }
    }
    this.updateButterflies(t, near);
  }

  /** Con gần nhất trong tầm vuốt ve. */
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const c of this.list) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < c.range && d < bd) { best = c; bd = d; }
    }
    return best;
  }

  topOf(c, out) { return out.set(c.x, (c.fixed?.[1] ?? 0) + (c.kind === 'buffalo' ? 1.55 : c.water ? 0.55 : 0.8), c.z); }

  // ---------- 🦋 bướm (1 lần vẽ cho cả đàn) ----------
  buildButterflies() {
    const g = new THREE.BufferGeometry();
    // 2 cánh hình tam giác đôi, nằm ngang
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, -0.13, 0, 0.09, -0.11, 0, -0.06, 0, 0, 0.05, 0.11, 0, -0.06, 0.13, 0, 0.09], 3));
    g.computeVertexNormals();
    const n = 12;
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    mesh.userData.keepMaterial = true;
    mesh.frustumCulled = false;
    const cols = ['#ffd166', '#ff9ec4', '#a0e7ff', '#ffffff', '#c77dff', '#ff8a4c'];
    const spots = [[15, 38.5], [15, 42], [34, 38.5], [34, 42], [50, 7], [57, 7], [49, 11.5], [58, 11.5], [21, 40], [28, 41], [43, 25], [36, 34]];
    this.flies = spots.map(([x, z], i) => ({ x, z, s: i * 1.7 + 0.3 }));
    const col = new THREE.Color();
    this.flies.forEach((_, i) => mesh.setColorAt(i, col.set(cols[i % cols.length])));
    this.scene.add(mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    return mesh;
  }

  updateButterflies(t, near) {
    const { _m: m, _q: q, _e: e, _p: p, _s: s } = this;
    let any = false;
    this.flies.forEach((f, i) => {
      if (Math.abs(f.x - near.x) > 25 || Math.abs(f.z - near.z) > 25) { this.butterflies.setMatrixAt(i, m.makeScale(0, 0, 0)); return; }
      any = true;
      const a = t * 0.6 + f.s;
      p.set(f.x + Math.sin(a) * 1.6 + Math.sin(a * 2.3) * 0.4, 0.7 + Math.sin(a * 1.7) * 0.35 + Math.abs(Math.sin(t * 9 + f.s)) * 0.08, f.z + Math.cos(a * 1.3) * 1.2);
      q.setFromEuler(e.set(0, Math.atan2(Math.cos(a), -Math.sin(a * 1.3)), 0));
      s.set(0.25 + Math.abs(Math.cos(t * 16 + f.s)) * 0.75, 1, 1); // vỗ cánh
      this.butterflies.setMatrixAt(i, m.compose(p, q, s));
    });
    if (any || !this._hidden) this.butterflies.instanceMatrix.needsUpdate = true;
    this._hidden = !any;
  }
}
