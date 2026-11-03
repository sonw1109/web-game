// 🌳 Rung cây: tán lá lắc lư, lá/cánh hoa rơi, có khi rụng quả hoặc chim bay vụt ra.
import * as THREE from 'three';
import { mat } from './avatar.js';

export const FRUITS = [
  { icon: '🍊', name: 'Cam', color: '#ff9f1c' },
  { icon: '🍎', name: 'Táo', color: '#e63946' },
  { icon: '🥭', name: 'Xoài', color: '#ffc93c' },
  { icon: '🍐', name: 'Lê', color: '#b5d33d' },
  { icon: '🍑', name: 'Đào', color: '#ffadad' },
];
const MAX_BITS = 64;

export class Nature {
  /** groups: [{ kind, list: [[x, z]], trunks, leaves, per }] – các InstancedMesh của cây. */
  constructor(scene, groups) {
    this.scene = scene;
    this.groups = Object.fromEntries(groups.map((g) => {
      const base = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < g.leaves.count; i++) { g.leaves.getMatrixAt(i, m); base.push(m.clone()); }
      return [g.kind, { ...g, base, shaking: new Map() }];
    }));
    // lá / cánh hoa rơi (1 lần vẽ)
    const bits = (this.bits = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.08), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), MAX_BITS));
    bits.userData.keepMaterial = true;
    bits.frustumCulled = false;
    bits.count = 0;
    bits.setColorAt(0, new THREE.Color());
    scene.add(bits);
    this.parts = [];
    this.fruits = [];
    this.birds = [];
    this._m = new THREE.Matrix4(); this._m2 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._c = new THREE.Color();
  }

  /** Cây gần (x, z) nhất trong bán kính r → { kind, i, x, z }. */
  nearest(x, z, r = 1.3) {
    let best = null, bd = r;
    for (const g of Object.values(this.groups)) {
      for (let i = 0; i < g.list.length; i++) {
        const d = Math.hypot(g.list[i][0] - x, g.list[i][1] - z);
        if (d < bd) { bd = d; best = { kind: g.kind, i, x: g.list[i][0], z: g.list[i][1] }; }
      }
    }
    return best;
  }

  /** Từ kết quả raycast (InstancedMesh) → cây nào. */
  fromHit(hit) {
    for (const g of Object.values(this.groups)) {
      if (hit.object === g.leaves) return { kind: g.kind, i: Math.floor(hit.instanceId / g.per) };
      if (hit.object === g.trunks) return { kind: g.kind, i: hit.instanceId };
    }
    return null;
  }
  meshes() { return Object.values(this.groups).flatMap((g) => [g.trunks, g.leaves]); }

  /** Rung cây. out: { type: 'fruit', fruit } | { type: 'bird' } | { type: 'leaves' } */
  shake(kind, i, out = { type: 'leaves' }) {
    const g = this.groups[kind];
    const pos = g?.list[i];
    if (!pos) return;
    g.shaking.set(i, 0.9);
    const [x, z] = pos;
    const pink = kind === 'sakura';
    const greens = pink ? ['#ffb7d0', '#ff9ec4', '#fff0f6'] : ['#4ea446', '#6bbf5a', '#8fcf5a', '#d9b44a'];
    for (let k = 0; k < (pink ? 16 : 10); k++) {
      if (this.parts.length >= MAX_BITS) this.parts.shift();
      this.parts.push({
        x: x + (Math.random() - 0.5) * 1.2, y: 1.3 + Math.random() * 0.8, z: z + (Math.random() - 0.5) * 1.2,
        vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, r: Math.random() * 6, life: 2.2 + Math.random(), color: greens[k % greens.length],
      });
    }
    if (out.type === 'fruit') {
      const f = FRUITS[out.fruit] || FRUITS[0];
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(f.color));
      m.castShadow = true;
      const a = Math.random() * 6.28;
      m.position.set(x + Math.cos(a) * 0.45, 1.5, z + Math.sin(a) * 0.45);
      this.scene.add(m);
      this.fruits.push({ m, vy: 0, life: 2.4 });
    }
    if (out.type === 'bird') this.birds.push(this.makeBird(x, z));
  }

  makeBird(x, z) {
    const g = new THREE.Group();
    const col = ['#5b7fa6', '#8c5a3c', '#e9c46a'][Math.floor(Math.random() * 3)];
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(col)); body.scale.set(1, 0.9, 1.4); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(col)); head.position.set(0, 0.06, 0.1); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 5), mat('#ffb703')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.05, 0.17); g.add(beak);
    const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.08), mat(col)); w.geometry.translate(s * 0.08, 0, 0); g.add(w); return w; });
    const a = Math.random() * 6.28;
    g.position.set(x, 1.7, z);
    g.rotation.y = a;
    this.scene.add(g);
    return { g, wings, dir: a, t: 0 };
  }

  update(dt, t) {
    const { _m: m, _m2: m2, _q: q, _e: e, _v: v, _s: s, _c: col } = this;
    // tán lá lắc lư quanh gốc cây
    for (const g of Object.values(this.groups)) {
      if (!g.shaking.size) continue;
      for (const [i, left] of g.shaking) {
        const k = Math.max(0, left - dt);
        const [x, z] = g.list[i], amp = (k / 0.9) * 0.16;
        q.setFromEuler(e.set(Math.sin(t * 38) * amp, 0, Math.cos(t * 31) * amp));
        for (let j = 0; j < g.per; j++) {
          const idx = i * g.per + j;
          // T(gốc) · R · T(-gốc) · M0
          m.makeTranslation(x, 0, z).multiply(m2.makeRotationFromQuaternion(q)).multiply(m2.makeTranslation(-x, 0, -z)).multiply(g.base[idx]);
          g.leaves.setMatrixAt(idx, k > 0 ? m : g.base[idx]);
        }
        g.leaves.instanceMatrix.needsUpdate = true;
        if (k > 0) g.shaking.set(i, k); else g.shaking.delete(i);
      }
    }
    // lá rơi lả tả
    if (this.parts.length || this.bits.count) {
      this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
      this.parts.forEach((p, i) => {
        p.y = Math.max(0.02, p.y - dt * 0.55); p.x += (p.vx + Math.sin(t * 3 + p.r) * 0.4) * dt; p.z += p.vz * dt; p.r += dt * 3;
        q.setFromEuler(e.set(p.r, p.r * 0.7, 0));
        this.bits.setMatrixAt(i, m.compose(v.set(p.x, p.y, p.z), q, s.setScalar(Math.min(1, p.life))));
        this.bits.setColorAt(i, col.set(p.color));
      });
      this.bits.count = this.parts.length;
      this.bits.instanceMatrix.needsUpdate = true;
      if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
    }
    // quả rơi, nảy rồi biến mất
    this.fruits = this.fruits.filter((f) => {
      f.life -= dt;
      f.vy -= 9.8 * dt; f.m.position.y += f.vy * dt;
      if (f.m.position.y < 0.1) { f.m.position.y = 0.1; f.vy = Math.abs(f.vy) * 0.35; }
      if (f.life < 0.4) f.m.scale.setScalar(Math.max(0.01, f.life / 0.4));
      if (f.life > 0) return true;
      f.m.removeFromParent(); f.m.geometry.dispose();
      return false;
    });
    // chim vỗ cánh bay đi
    this.birds = this.birds.filter((b) => {
      b.t += dt;
      b.g.position.x += Math.sin(b.dir) * dt * 4; b.g.position.z += Math.cos(b.dir) * dt * 4; b.g.position.y += dt * (2.4 - b.t * 0.3);
      const f = Math.sin(t * 30) * 0.9;
      b.wings[0].rotation.z = f; b.wings[1].rotation.z = -f;
      if (b.t < 3.5) return true;
      b.g.removeFromParent(); b.g.traverse((o) => o.geometry?.dispose());
      return false;
    });
  }
}
