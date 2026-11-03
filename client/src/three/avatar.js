// Nhân vật chibi 3D: đầu to tròn, áo dài có đai chéo, tay chắp trước ngực.
import * as THREE from 'three';
import { Q } from './quality.js';
import { EMOTES, FACE_GEO, faceMaterial } from './expressions.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    if (Q.cheapMaterials) {
      const { roughness, metalness, ...rest } = opts; void roughness; void metalness;
      matCache.set(key, new THREE.MeshLambertMaterial({ color, ...rest }));
    } else matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}

const shade = (hex, amt) => {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
};

// Hình dáng thân áo (xoay quanh trục Y): rộng ở gấu, thắt ở cổ
const ROBE = new THREE.LatheGeometry([
  [0.0, 0.02], [0.27, 0.02], [0.29, 0.06], [0.27, 0.16], [0.235, 0.3], [0.2, 0.42], [0.15, 0.5], [0.09, 0.55], [0.0, 0.56],
].map(([x, y]) => new THREE.Vector2(x, y)), 28);
const HEM = new THREE.LatheGeometry([[0.0, 0.0], [0.285, 0.0], [0.3, 0.05], [0.285, 0.13], [0.0, 0.13]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
const HEAD = new THREE.SphereGeometry(0.31, 32, 24);
const SMALL = new THREE.SphereGeometry(1, 16, 12);
const ARM = new THREE.CapsuleGeometry(0.055, 0.17, 4, 10);
const SASH = new THREE.TorusGeometry(0.215, 0.028, 8, 32, Math.PI * 1.15);
for (const g of [ROBE, HEM, HEAD, SMALL, ARM, SASH]) g.userData.shared = true;

export class Avatar {
  constructor(app) {
    this.root = new THREE.Group();        // vị trí + hướng trên mặt đất
    this.body = new THREE.Group();        // phần nhún nhảy
    this.root.add(this.body);
    this.phase = Math.random() * 10;
    this.targetRot = 0;
    this.moving = false;
    this.sitting = false;
    this.jumpT = 0;
    this.build(app);
  }

  build(a) {
    const b = this.body;
    const add = (geo, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      b.add(mesh);
      return mesh;
    };
    const skin = mat(a.skin), robe = mat(a.shirt), hem = mat(a.pants), sash = mat('#e6c35c', { roughness: 0.5, metalness: 0.2 });

    add(ROBE, robe);
    add(HEM, hem);
    const s = add(SASH, sash, 0, 0.34, 0);
    s.rotation.set(Math.PI / 2 - 0.1, 0.55, -0.6);
    // tay chắp trước ngực
    const up = new THREE.Vector3(0, 1, 0);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Vector3(side * 0.17, 0.47, 0.03), hand = new THREE.Vector3(side * 0.045, 0.34, 0.25);
      const dir = hand.clone().sub(shoulder);
      const arm = add(ARM, mat(shade(a.shirt, -0.06)));
      arm.position.copy(shoulder).addScaledVector(dir, 0.5);
      arm.quaternion.setFromUnitVectors(up, dir.normalize());
      arm.scale.set(1, 1.05, 1);
    }
    add(SMALL, skin, 0, 0.345, 0.255, 0.07, 0.08, 0.055);
    // chân
    this.feet = [-1, 1].map((side) => add(SMALL, mat('#3a2a22'), side * 0.1, 0.03, 0.17, 0.075, 0.05, 0.1));

    // đầu
    const head = (this.head = new THREE.Group());
    head.position.y = 0.82;
    b.add(head);
    const h = new THREE.Mesh(HEAD, skin);
    h.castShadow = true; head.add(h);
    const eye = mat('#1d1820', { roughness: 0.3 });
    const blush = mat('#ff8e8e', { transparent: true, opacity: 0.55 });
    this.faceParts = [];
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(SMALL, eye); e.position.set(side * 0.1, 0.0, 0.285); e.scale.set(0.035, 0.05, 0.03); head.add(e);
      const c = new THREE.Mesh(SMALL, blush); c.position.set(side * 0.17, -0.07, 0.255); c.scale.set(0.05, 0.03, 0.02); head.add(c);
      this.faceParts.push(e, c);
      const ear = new THREE.Mesh(SMALL, skin); ear.position.set(side * 0.3, -0.02, 0); ear.scale.set(0.05, 0.08, 0.05); head.add(ear);
    }
    this.buildHair(a);
  }

  buildHair(a) {
    const hm = mat(a.hair, { roughness: 0.6 });
    const head = this.head;
    const style = a.hairStyle | 0;
    const part = (geo, x, y, z, sx = 1, sy = sx, sz = sx, rx = 0) => {
      const m = new THREE.Mesh(geo, hm);
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; m.castShadow = true;
      head.add(m);
      return m;
    };
    if (style === 3) {
      // Búi tóc trên đỉnh (đầu gần như trọc như chú tiểu)
      part(SMALL, 0, 0.32, -0.04, 0.09);
      part(new THREE.SphereGeometry(0.315, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.32), 0, 0.005, -0.01, 1, 1, 1, -0.35);
      return;
    }
    // Mái tóc: chỏm cầu phủ đỉnh + sau đầu, chừa trán
    part(new THREE.SphereGeometry(0.325, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.01, -0.015, 1, 1, 1, -0.42);
    if (style === 1) {
      // Tóc dài xõa sau lưng
      part(new THREE.CapsuleGeometry(0.2, 0.28, 6, 16), 0, -0.22, -0.13, 1.25, 1, 0.75);
    }
    if (style === 2) {
      // Tóc dựng
      const cone = new THREE.ConeGeometry(0.07, 0.18, 8);
      [[0, 0.33, 0.02, 0], [-0.13, 0.29, 0.02, 0.5], [0.13, 0.29, 0.02, -0.5], [-0.07, 0.3, -0.12, 0.3], [0.07, 0.3, -0.12, -0.3]].forEach(([x, y, z, rz]) => {
        const c = part(cone, x, y, z);
        c.rotation.z = rz;
      });
    }
  }

  setPosition(x, z, y = 0) { this.root.position.set(x, y, z); }
  faceTo(angle) { this.targetRot = angle; }
  jump() { this.jumpT = 0.6; }
  /** Hành động + biểu cảm (xem EMOTE_LIST). Đi lại thì dừng. */
  emote(type) {
    const e = EMOTES[type];
    if (!e) return;
    this.emoteType = type; this.emoteDur = this.emoteT = e.dur;
    this.setFace(e.face);
  }

  /** Đổi mặt: null = mặt thường (mắt tròn). */
  setFace(face) {
    if (face === this.faceName) return;
    this.faceName = face;
    if (!face) { if (this.face) this.face.visible = false; for (const p of this.faceParts) p.visible = true; return; }
    if (!this.face) { this.face = new THREE.Mesh(FACE_GEO, faceMaterial(face)); this.face.userData.keepMaterial = true; this.head.add(this.face); }
    this.face.material = faceMaterial(face);
    this.face.visible = true;
    for (const p of this.faceParts) p.visible = false;
  }

  stopEmote() {
    this.emoteT = 0;
    this.body.rotation.set(0, 0, 0); this.body.position.y = 0; this.head.rotation.set(0, 0, 0);
    this.setFace(null);
  }

  update(dt, t) {
    // xoay mượt về hướng mục tiêu (đường ngắn nhất)
    let d = this.targetRot - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 12);

    const b = this.body;
    if (this.emoteT > 0 && !this.moving) {
      this.emoteT -= dt;
      this.animateEmote(t, 1 - this.emoteT / this.emoteDur);
      if (this.emoteT <= 0) this.stopEmote();
      for (const f of this.feet) f.visible = !this.sitting && this.emoteType !== 'kowtow';
      return;
    }
    if (this.moving && this.emoteT > 0) this.stopEmote();
    if (this.moving) {
      this.phase += dt * 11;
      b.position.y = Math.abs(Math.sin(this.phase)) * 0.07;
      b.rotation.z = Math.sin(this.phase) * 0.09;
      this.feet[0].position.z = 0.17 + Math.sin(this.phase) * 0.06;
      this.feet[1].position.z = 0.17 - Math.sin(this.phase) * 0.06;
    } else {
      b.position.y *= 0.8;
      b.rotation.z *= 0.8;
      b.scale.y = 1 + Math.sin(t * 2.2 + this.phase) * 0.012;
    }
    if (this.jumpT > 0) {
      this.jumpT = Math.max(0, this.jumpT - dt);
      b.position.y = Math.sin((this.jumpT / 0.6) * Math.PI) * 0.45;
    }
    for (const f of this.feet) f.visible = !this.sitting;
    this.head.rotation.z = this.moving ? 0 : Math.sin(t * 0.9 + this.phase) * 0.04;
  }

  animateEmote(t, p) {
    const b = this.body, h = this.head, k = Math.sin(t * 11);
    b.rotation.set(0, 0, 0); b.position.y = 0; h.rotation.set(0, 0, 0);
    switch (this.emoteType) {
      case 'dance': b.rotation.y = k * 0.55; b.rotation.z = Math.sin(t * 5.5) * 0.12; b.position.y = Math.abs(k) * 0.14; h.rotation.z = -k * 0.2; break;
      case 'bow': b.rotation.x = Math.sin(Math.min(1, p * 1.6) * Math.PI) * 0.55; break;
      case 'wave': b.rotation.z = Math.sin(t * 9) * 0.16; h.rotation.z = Math.sin(t * 9 + 1) * 0.25; b.position.y = Math.abs(Math.sin(t * 9)) * 0.05; break;
      case 'spin': b.rotation.y = p * Math.PI * 4; b.position.y = Math.sin(p * Math.PI) * 0.35; break;
      case 'laugh': b.rotation.x = -0.12 + Math.sin(t * 16) * 0.08; b.position.y = Math.abs(Math.sin(t * 16)) * 0.06; h.rotation.x = -0.15; break;
      case 'love': b.rotation.z = Math.sin(t * 4) * 0.14; b.position.y = Math.abs(Math.sin(t * 4)) * 0.08; h.rotation.z = Math.sin(t * 4 + 0.6) * 0.18; break;
      case 'angry': b.position.y = Math.abs(Math.sin(t * 13)) * 0.09; b.rotation.y = Math.sin(t * 34) * 0.07; h.rotation.x = 0.12; break;
      case 'cry': h.rotation.x = 0.28; b.rotation.x = 0.1; b.rotation.z = Math.sin(t * 22) * 0.045; break;
      case 'shock': if (p < 0.22) b.position.y = Math.sin((p / 0.22) * Math.PI) * 0.42; b.rotation.x = -0.22 * Math.min(1, p * 5); h.rotation.x = -0.1; break;
      case 'sleep': h.rotation.z = 0.32 + Math.sin(t * 1.6) * 0.05; h.rotation.x = 0.18; b.rotation.z = 0.06 + Math.sin(t * 1.6) * 0.04; b.position.y = -0.02 + Math.sin(t * 1.6) * 0.012; break;
      case 'shy': b.rotation.y = Math.sin(t * 3) * 0.35; h.rotation.x = 0.22; h.rotation.z = Math.sin(t * 3) * 0.1; break;
      case 'kowtow': { // quỳ xuống rồi lạy 3 lạy
        b.position.y = -0.2 * Math.min(1, p * 6);
        const ph = Math.max(0, (p - 0.12) / 0.83) * 3;
        b.rotation.x = p > 0.12 && p < 0.95 ? Math.abs(Math.sin(ph * Math.PI)) * 0.95 : 0;
        h.rotation.x = 0.15;
        break;
      }
      case 'cheer': b.position.y = Math.abs(Math.sin(t * 7)) * 0.42; b.rotation.y = Math.sin(t * 3.5) * 0.3; h.rotation.x = -0.2; break;
    }
  }

  /** Điểm trên đỉnh đầu (để đặt tên / bong bóng chat). */
  topPosition(out = new THREE.Vector3()) {
    return this.root.localToWorld(out.set(0, 1.25 + this.body.position.y, 0));
  }

  dispose() {
    this.root.removeFromParent();
    // giải phóng hình khối riêng của nhân vật (tóc…); hình dùng chung giữ lại
    this.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
}
