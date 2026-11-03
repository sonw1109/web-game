// 🐾 Thú cưng đi theo chủ: mèo, cún, gà con, thỏ – dựng từ hình khối đơn giản, nhảy lon ton khi chạy.
import * as THREE from 'three';
import { mat } from './avatar.js';

export const PETS = [null, { id: 'cat', name: 'Mèo', icon: '🐱' }, { id: 'dog', name: 'Cún', icon: '🐶' }, { id: 'chick', name: 'Gà con', icon: '🐤' }, { id: 'bunny', name: 'Thỏ', icon: '🐰' }];
const S = new THREE.SphereGeometry(1, 14, 10);
const C = new THREE.ConeGeometry(1, 1, 8);
S.userData.shared = C.userData.shared = true;

function part(g, geo, m, [x, y, z], [sx, sy, sz], rot) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.scale.set(sx, sy, sz);
  if (rot) o.rotation.set(...rot);
  o.castShadow = true;
  g.add(o);
  return o;
}

export function buildPet(type) {
  const g = new THREE.Group();
  const eye = mat('#1d1820', { roughness: 0.3 });
  const eyes = (y, z, dx = 0.06) => { for (const s of [-1, 1]) part(g, S, eye, [s * dx, y, z], [0.022, 0.03, 0.02]); };
  if (type === 'cat' || type === 'dog') {
    const fur = mat(type === 'cat' ? '#f0a35e' : '#c89b6d'), light = mat(type === 'cat' ? '#fff1e0' : '#f1e3cf');
    part(g, S, fur, [0, 0.2, 0], [0.16, 0.13, 0.24]);              // thân
    part(g, S, fur, [0, 0.36, 0.2], [0.13, 0.12, 0.12]);            // đầu
    part(g, S, light, [0, 0.33, 0.3], [0.06, 0.045, 0.04]);         // mõm
    eyes(0.39, 0.31);
    if (type === 'cat') for (const s of [-1, 1]) part(g, C, fur, [s * 0.07, 0.48, 0.19], [0.045, 0.08, 0.045]);
    else for (const s of [-1, 1]) part(g, S, mat('#8a5a3c'), [s * 0.12, 0.34, 0.18], [0.035, 0.08, 0.05], [0, 0, s * 0.3]);
    const tail = part(g, S, fur, [0, 0.3, -0.25], [0.035, 0.035, 0.12], [-0.8, 0, 0]);
    g.userData.wag = tail;
    for (const [x, z] of [[-0.09, 0.13], [0.09, 0.13], [-0.09, -0.13], [0.09, -0.13]]) part(g, S, fur, [x, 0.06, z], [0.04, 0.06, 0.04]);
  } else if (type === 'chick') {
    const y = mat('#ffd43b');
    part(g, S, y, [0, 0.14, 0], [0.14, 0.13, 0.15]);
    part(g, S, y, [0, 0.3, 0.06], [0.1, 0.1, 0.1]);
    part(g, C, mat('#ff922b'), [0, 0.29, 0.17], [0.03, 0.06, 0.03], [Math.PI / 2, 0, 0]);
    eyes(0.33, 0.14, 0.045);
    for (const s of [-1, 1]) part(g, S, y, [s * 0.13, 0.15, -0.02], [0.03, 0.07, 0.08]);
  } else if (type === 'bunny') {
    const w = mat('#f8f4f0'), pink = mat('#ffb3c7');
    part(g, S, w, [0, 0.16, 0], [0.15, 0.14, 0.18]);
    part(g, S, w, [0, 0.32, 0.13], [0.11, 0.1, 0.1]);
    for (const s of [-1, 1]) { part(g, S, w, [s * 0.05, 0.5, 0.1], [0.03, 0.1, 0.025], [0, 0, s * 0.15]); part(g, S, pink, [s * 0.05, 0.5, 0.115], [0.018, 0.075, 0.01], [0, 0, s * 0.15]); }
    part(g, S, pink, [0, 0.31, 0.225], [0.02, 0.015, 0.01]);
    eyes(0.35, 0.21, 0.05);
    part(g, S, w, [0, 0.16, -0.18], [0.06, 0.06, 0.06]); // đuôi bông
  }
  return g;
}

export class Pet {
  constructor(type, scene) {
    this.type = type;
    this.root = buildPet(type);
    this.root.scale.setScalar(1.15);
    scene.add(this.root);
    this.phase = Math.random() * 10;
    this.placed = false;
  }

  /** Đi theo sau lưng bên phải chủ; nhảy lon ton khi di chuyển. */
  update(dt, t, owner) {
    const r = owner.rotation.y;
    const tx = owner.position.x - Math.sin(r) * 0.85 + Math.cos(r) * 0.55;
    const tz = owner.position.z - Math.cos(r) * 0.85 - Math.sin(r) * 0.55;
    const p = this.root.position;
    if (!this.placed) { p.set(tx, 0, tz); this.placed = true; }
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    if (dist > 12) p.set(tx, 0, tz); // dịch chuyển xa → đi theo luôn
    const moving = dist > 0.12;
    const k = Math.min(1, dt * (dist > 2 ? 6 : 3.5));
    p.x += dx * k; p.z += dz * k;
    const want = moving ? Math.atan2(dx, dz) : r;
    let d = want - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 8);
    this.phase += dt * (moving ? 14 : 2);
    p.y = moving ? Math.abs(Math.sin(this.phase)) * 0.12 : 0;
    if (this.root.userData.wag) this.root.userData.wag.rotation.y = Math.sin(t * (moving ? 14 : 6)) * 0.6;
  }

  dispose() { this.root.removeFromParent(); this.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); }
}
