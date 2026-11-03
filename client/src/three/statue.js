// 🙏 Tượng đài "Ông Chủ Hội Quán": tượng chibi dát vàng cao ~8m – tóc đen bù xù, kính gọng bạc to,
// mặt tròn, mắt lim dim, môi chu, tay phải giơ lên ban phước. Phía trước có bàn thờ, bát hương,
// đèn nến, mâm ngũ quả, ống xin quẻ và 3 chiếu quỳ.
// Các phần cùng vật liệu được gộp thành 1 khối → cả tượng chỉ tốn vài lần vẽ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from './quality.js';
import { STATUE, ALTAR, MATS } from '../game/map.js';

const SCALE = 5.2;           // tượng = nhân vật × 5.2
const PEDESTAL_H = 1.8;
const MAX_STICKS = 12;

function M(color, o = {}) {
  return Q.cheapMaterials ? new THREE.MeshLambertMaterial({ color, emissive: o.emissive, emissiveIntensity: o.emissiveIntensity ?? 1, transparent: o.transparent, opacity: o.opacity })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });
}

/** Gom các khối theo vật liệu → mỗi vật liệu 1 mesh. */
class Baker {
  constructor() { this.by = new Map(); }
  add(mat, geo, { p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], q } = {}) {
    const g = geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), q || new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...(typeof s === 'number' ? [s, s, s] : s)));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return this;
  }
  /** Khối nối 2 điểm (tay, gọng kính…). */
  link(mat, geo, a, b, thick = 1) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return this.add(mat, geo, { p: A.clone().add(B).multiplyScalar(0.5).toArray(), s: [thick, len, thick], q });
  }
  build(group, shadow = true) {
    for (const [mat, geos] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.userData.keepMaterial = true;
      group.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    return group;
  }
}

const SPH = new THREE.SphereGeometry(1, 20, 14), CONE = new THREE.ConeGeometry(1, 1, 8), CYL = new THREE.CylinderGeometry(1, 1, 1, 16), BOX = new THREE.BoxGeometry(1, 1, 1);

function plaqueTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = '#7a1414'; c.fillRect(0, 0, 512, 160);
  c.strokeStyle = '#f5d36b'; c.lineWidth = 8; c.strokeRect(10, 10, 492, 140);
  c.fillStyle = '#ffe08a'; c.textAlign = 'center';
  c.font = 'bold 50px "Be Vietnam Pro", system-ui, sans-serif'; c.fillText('ÔNG CHỦ HỘI QUÁN', 256, 74);
  c.font = '30px "Be Vietnam Pro", system-ui, sans-serif'; c.fillText('~ phù hộ độ trì ~', 256, 120);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Tượng (đơn vị = kích thước nhân vật, mặt hướng +z). */
function statueBody(bk, mats) {
  const { gold, shirt, hair, silver, lip, eye, lens } = mats;
  // áo thun + quần + giày
  const shirtGeo = new THREE.LatheGeometry([[0, 0.17], [0.235, 0.17], [0.255, 0.24], [0.25, 0.38], [0.215, 0.48], [0.12, 0.55], [0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
  bk.add(shirt, shirtGeo);
  for (const s of [-1, 1]) {
    bk.add(shirt, CYL, { p: [s * 0.09, 0.1, 0], s: [0.085, 0.18, 0.085] });
    bk.add(hair, BOX, { p: [s * 0.09, 0.025, 0.04], s: [0.12, 0.05, 0.2] }); // giày
    bk.add(shirt, SPH, { p: [s * 0.2, 0.47, 0], s: [0.075, 0.07, 0.075] }); // tay áo
  }
  // tay phải giơ cao ban phước, tay trái đặt trước bụng
  const arm = new THREE.CapsuleGeometry(0.25, 0.5, 4, 10); // cao 1, bán kính 0.25 → link() co theo độ dày
  const ARM_T = 4 * 0.055;
  bk.link(gold, arm, [0.22, 0.47, 0.02], [0.33, 0.72, 0.1], ARM_T);
  bk.add(gold, SPH, { p: [0.34, 0.78, 0.11], s: [0.055, 0.07, 0.035] });
  bk.link(gold, arm, [-0.22, 0.46, 0.02], [-0.06, 0.33, 0.24], ARM_T);
  bk.add(gold, SPH, { p: [-0.04, 0.33, 0.25], s: [0.05, 0.045, 0.05] });
  bk.add(gold, CYL, { p: [0, 0.59, 0], s: [0.07, 0.08, 0.07] }); // cổ
  // đầu tròn
  const H = [0, 0.84, 0];
  const at = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  bk.add(gold, SPH, { p: H, s: [0.33, 0.31, 0.31] });
  bk.add(gold, SPH, { p: at(0, -0.12, 0.13), s: [0.24, 0.17, 0.2] }); // má phúng phính
  for (const s of [-1, 1]) bk.add(gold, SPH, { p: at(s * 0.32, -0.02, 0), s: [0.05, 0.08, 0.05] }); // tai
  bk.add(gold, SPH, { p: at(0, -0.07, 0.315), s: [0.05, 0.045, 0.05] }); // mũi
  // mắt lim dim + lông mày
  for (const s of [-1, 1]) {
    bk.add(eye, SPH, { p: at(s * 0.11, 0.0, 0.29), s: [0.04, 0.016, 0.02] });
    bk.add(hair, BOX, { p: at(s * 0.11, 0.075, 0.292), s: [0.085, 0.014, 0.02], r: [0, 0, s * -0.12] });
  }
  // môi chu
  bk.add(lip, SPH, { p: at(0, -0.155, 0.3), s: [0.075, 0.026, 0.04] });
  bk.add(lip, SPH, { p: at(0, -0.185, 0.295), s: [0.068, 0.028, 0.04] });
  // kính gọng bạc to
  const ring = new THREE.TorusGeometry(1, 0.1, 6, 24);
  for (const s of [-1, 1]) {
    bk.add(silver, ring, { p: at(s * 0.12, 0.005, 0.322), s: [0.1, 0.075, 0.09] });
    bk.add(lens, new THREE.CircleGeometry(1, 20), { p: at(s * 0.12, 0.005, 0.322), s: [0.1, 0.075, 1] });
    bk.link(silver, CYL, at(s * 0.215, 0.02, 0.31), at(s * 0.31, 0.02, 0.04), 0.008); // gọng tai
  }
  bk.link(silver, CYL, at(-0.03, 0.02, 0.33), at(0.03, 0.02, 0.33), 0.008); // cầu kính
  // tóc đen bù xù: chỏm + mái lệch + những lọn dựng
  bk.add(hair, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), { p: at(0, 0.02, -0.02), s: [0.345, 0.34, 0.34], r: [-0.38, 0, 0] });
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, el = 0.25 + rnd() * 1.0;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el) - 0.15).normalize();
    if (dir.z > 0.55 && dir.y < 0.6) continue; // chừa mặt
    const base = dir.clone().multiplyScalar(0.3);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.6, 0.3, (rnd() - 0.5) * 0.6)).normalize());
    bk.add(hair, CONE, { p: at(base.x, base.y + 0.02, base.z), s: [0.06 + rnd() * 0.03, 0.15 + rnd() * 0.1, 0.06], q });
  }
  for (let i = 0; i < 5; i++) { // mái lòa xòa trước trán, rẽ ngôi lệch phải
    const x = -0.16 + i * 0.075;
    bk.add(hair, CONE, { p: at(x, 0.2, 0.24), s: [0.06, 0.16, 0.045], r: [1.9, 0, 0.5 + i * 0.05] });
  }
}

export class Shrine {
  constructor(scene) {
    this.scene = scene;
    const root = (this.root = new THREE.Group());
    scene.add(root);
    const gold = M('#f4c75e', { metalness: 0.75, roughness: 0.3, emissive: '#8a5c08', emissiveIntensity: 0.45 }); // tự sáng nhẹ để mặt tượng không tối khi khuất nắng
    this.gold = gold;
    const mats = {
      gold, shirt: M('#2b2622', { metalness: 0.6, roughness: 0.35 }), hair: M('#15110e', { roughness: 0.35, metalness: 0.3 }),
      silver: M('#dfe4ea', { metalness: 1, roughness: 0.15 }), lip: M('#d9876a', { metalness: 0.6, roughness: 0.3 }), eye: M('#1d1820', { roughness: 0.2 }),
      lens: M('#bfe6ff', { transparent: true, opacity: 0.28, metalness: 0.5, roughness: 0.05 }),
    };
    // bệ đá 3 tầng
    const stone = M('#bcb3a6', { roughness: 0.85 }), stoneDark = M('#8f877c', { roughness: 0.9 });
    const ped = new Baker();
    ped.add(stoneDark, new THREE.CylinderGeometry(2.3, 2.45, 0.45, 8), { p: [0, 0.22, 0] });
    ped.add(stone, new THREE.CylinderGeometry(1.75, 1.95, 1.05, 8), { p: [0, 0.97, 0] });
    ped.add(stoneDark, new THREE.CylinderGeometry(1.55, 1.6, 0.3, 8), { p: [0, PEDESTAL_H - 0.15, 0] });
    const pedestal = ped.build(new THREE.Group());
    pedestal.position.set(STATUE.x, 0, STATUE.z);
    pedestal.rotation.y = Math.PI / 8;
    root.add(pedestal);
    // biển tên vàng trên mặt bệ
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.6), new THREE.MeshBasicMaterial({ map: plaqueTexture() }));
    plaque.position.set(STATUE.x + 1.75, 0.98, STATUE.z); plaque.rotation.y = Math.PI / 2;
    plaque.userData.keepMaterial = true;
    root.add(plaque);
    // tượng
    const st = new THREE.Group();
    const bk = new Baker(); statueBody(bk, mats); bk.build(st);
    st.scale.setScalar(SCALE);
    st.position.set(STATUE.x, PEDESTAL_H, STATUE.z);
    st.rotation.y = Math.PI / 2; // mặt hướng đông (lối vào)
    root.add(st);
    this.statue = st;
    // vầng hào quang sau đầu
    const halo = (this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.75 })));
    halo.position.set(0, 0.9, -0.2); halo.userData.keepMaterial = true;
    st.add(halo);
    const glow = (this.glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.12, depthWrite: false })));
    glow.position.set(0, 0.9, -0.21); glow.userData.keepMaterial = true;
    st.add(glow);
    this.buildAltar();
    this.glowT = 0;
    this.miracleT = 0;
    this.sticks = [];          // [{ ts }]
    this.smoke = [];
  }

  buildAltar() {
    const { x, z } = ALTAR;
    const red = M('#8e1b1b', { roughness: 0.45, metalness: 0.1 }), trim = M('#e0b34a', { metalness: 0.8, roughness: 0.3 }), bronze = M('#7a5a2e', { metalness: 0.7, roughness: 0.4 });
    const bk = new Baker();
    bk.add(red, BOX, { p: [0, 0.45, 0], s: [ALTAR.d, 0.9, ALTAR.w] });            // thân bàn (dài theo trục x của cụm)
    bk.add(trim, BOX, { p: [0, 0.91, 0], s: [ALTAR.d + 0.08, 0.04, ALTAR.w + 0.08] });
    bk.add(trim, BOX, { p: [0, 0.5, ALTAR.w / 2 + 0.005], s: [ALTAR.d - 0.3, 0.42, 0.01] });
    bk.add(red, BOX, { p: [0, 0.48, ALTAR.w / 2 + 0.012], s: [ALTAR.d - 0.4, 0.32, 0.01] });
    bk.add(bronze, new THREE.CylinderGeometry(0.2, 0.15, 0.2, 16), { p: [0, 1.03, 0] });  // bát hương
    bk.add(M('#d8cfc0', { roughness: 1 }), new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), { p: [0, 1.125, 0] }); // tro
    for (const s of [-1, 1]) {
      bk.add(trim, CYL, { p: [s * 0.85, 0.96, 0], s: [0.07, 0.06, 0.07] });
      bk.add(M('#f3ead7'), CYL, { p: [s * 0.85, 1.1, 0], s: [0.04, 0.22, 0.04] }); // nến
    }
    // mâm ngũ quả bên trái, ống xin quẻ bên phải
    bk.add(trim, new THREE.CylinderGeometry(0.26, 0.18, 0.05, 16), { p: [-0.48, 0.96, 0.05] });
    [['#ff9f1c', -0.55, 0.0], ['#e63946', -0.4, 0.08], ['#ffc93c', -0.5, 0.14], ['#b5d33d', -0.42, -0.06], ['#6a994e', -0.48, 0.06]].forEach(([c, px, pz], i) => bk.add(M(c), SPH, { p: [px, 1.03 + (i === 4 ? 0.07 : 0), pz], s: 0.075 }));
    bk.add(M('#c7a36a', { roughness: 0.7 }), CYL, { p: [0.48, 1.06, 0.05], s: [0.08, 0.26, 0.08] });
    for (let i = 0; i < 7; i++) bk.add(M('#e9d8a6'), CYL, { p: [0.45 + (i % 3) * 0.025, 1.26, 0.03 + Math.floor(i / 3) * 0.025], s: [0.008, 0.2, 0.008], r: [(i - 3) * 0.05, 0, (i - 3) * 0.04] });
    const altar = bk.build(new THREE.Group());
    altar.position.set(x, 0, z); altar.rotation.y = Math.PI / 2; // mặt bàn hướng đông như tượng
    this.root.add(altar);
    // ngọn nến lung linh
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ffcf5a' });
    this.flames = [-1, 1].map((s) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), flameMat);
      f.scale.y = 1.8; f.position.set(x, 1.25, z - s * 0.85); f.userData.keepMaterial = true;
      this.root.add(f); return f;
    });
    if (Q.extraLights) { const l = new THREE.PointLight('#ffb35c', 1.2, 6, 1.6); l.position.set(x + 0.4, 1.6, z); this.root.add(l); }
    // chiếu quỳ đỏ
    const matGeo = new THREE.BoxGeometry(0.62, 0.06, 0.62);
    const cushions = new THREE.InstancedMesh(matGeo, M('#b3202a', { roughness: 0.9 }), MATS.length);
    MATS.forEach((m, i) => cushions.setMatrixAt(i, new THREE.Matrix4().makeTranslation(m.x, 0.03, m.z)));
    cushions.receiveShadow = true; cushions.userData.keepMaterial = true;
    this.root.add(cushions);
    // nhang (hiện khi có người thắp) + khói
    const stick = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4); stick.translate(0, 0.18, 0);
    this.stickMesh = new THREE.InstancedMesh(stick, new THREE.MeshBasicMaterial({ color: '#b8452c' }), MAX_STICKS);
    this.stickMesh.count = 0; this.stickMesh.userData.keepMaterial = true;
    this.root.add(this.stickMesh);
    this.tipMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff5a1f' }), MAX_STICKS);
    this.tipMesh.count = 0; this.tipMesh.userData.keepMaterial = true;
    this.root.add(this.tipMesh);
    const SMOKE = 60;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3));
    this.smokePts = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#e8e4dc', size: 0.22, transparent: true, opacity: 0.35, depthWrite: false }));
    this.smokePts.frustumCulled = false; this.smokePts.userData.keepMaterial = true;
    this.smokeMax = SMOKE;
    this.root.add(this.smokePts);
    this.bowl = new THREE.Vector3(x, 1.13, z);
  }

  /** Danh sách nén nhang đang cháy (dấu thời gian). */
  setSticks(list) {
    this.sticks = list.slice(-MAX_STICKS);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    this.sticks.forEach((st, i) => {
      const a = i * 2.4, r = 0.04 + (i % 4) * 0.03;
      const lean = 0.08 + (i % 3) * 0.05;
      q.setFromEuler(e.set(Math.sin(a) * lean, 0, Math.cos(a) * lean));
      v.set(this.bowl.x + Math.cos(a) * r, this.bowl.y, this.bowl.z + Math.sin(a) * r);
      this.stickMesh.setMatrixAt(i, m.compose(v, q, s));
      const tip = new THREE.Vector3(0, 0.36, 0).applyQuaternion(q).add(v);
      this.tipMesh.setMatrixAt(i, m.compose(tip, q.identity(), s));
      st.tip = tip;
    });
    this.stickMesh.count = this.tipMesh.count = this.sticks.length;
    this.stickMesh.instanceMatrix.needsUpdate = this.tipMesh.instanceMatrix.needsUpdate = true;
  }

  /** Có người lạy / thắp hương → hào quang sáng lên. */
  pulse(power = 1) { this.glowT = Math.max(this.glowT, 1.6 * power); }
  /** Hiển linh: tượng rung nhẹ, hào quang chói, (main gọi pháo hoa). */
  miracle() { this.miracleT = 4; this.pulse(2); }

  update(dt, t, near) {
    // ở rất xa thì không cần hoạt hình chi tiết
    const far = Math.abs(near.x - STATUE.x) > 45 || Math.abs(near.z - STATUE.z) > 45;
    this.glowT = Math.max(0, this.glowT - dt);
    const g = this.glowT;
    this.halo.material.opacity = 0.55 + Math.sin(t * 2) * 0.12 + Math.min(1, g) * 0.4;
    this.glowDisc.material.opacity = 0.1 + Math.min(1, g) * 0.45;
    this.halo.rotation.z = t * 0.3;
    this.gold.emissiveIntensity = 0.45 + Math.min(1, g) * 0.6;
    if (this.miracleT > 0) {
      this.miracleT -= dt;
      const k = Math.max(0, this.miracleT) / 4;
      this.statue.position.y = PEDESTAL_H + Math.abs(Math.sin(t * 6)) * 0.25 * k;
      this.statue.rotation.y = Math.PI / 2 + Math.sin(t * 9) * 0.06 * k;
      const sc = 1 + Math.sin(t * 4) * 0.3 * k;
      this.halo.scale.setScalar(sc); this.glowDisc.scale.setScalar(sc * 1.2);
    } else if (this.statue.position.y !== PEDESTAL_H) { this.statue.position.y = PEDESTAL_H; this.statue.rotation.y = Math.PI / 2; this.halo.scale.setScalar(1); this.glowDisc.scale.setScalar(1); }
    if (far) return;
    for (const [i, f] of this.flames.entries()) { f.scale.set(1 + Math.sin(t * 17 + i) * 0.15, 1.8 + Math.sin(t * 23 + i * 2) * 0.35, 1); }
    // khói nhang bay lên uốn lượn
    const now = Date.now();
    this.sticks = this.sticks.filter((s) => now - s.ts < 180_000);
    if (this.sticks.length !== this.stickMesh.count) this.setSticks(this.sticks);
    if (this.sticks.length && this.smoke.length < this.smokeMax && Math.random() < dt * 14) {
      const s = this.sticks[Math.floor(Math.random() * this.sticks.length)];
      if (s.tip) this.smoke.push({ x: s.tip.x, y: s.tip.y, z: s.tip.z, life: 2.6, ph: Math.random() * 6 });
    }
    const arr = this.smokePts.geometry.attributes.position.array;
    this.smoke = this.smoke.filter((p) => (p.life -= dt) > 0);
    this.smoke.forEach((p, i) => {
      p.y += dt * 0.35; p.x += Math.sin(t * 1.5 + p.ph) * dt * 0.08; p.z += Math.cos(t * 1.2 + p.ph) * dt * 0.08;
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    });
    this.smokePts.geometry.setDrawRange(0, this.smoke.length);
    this.smokePts.geometry.attributes.position.needsUpdate = true;
  }

  /** Điểm trên đỉnh tượng (để đặt bảng tên / bong bóng lời phán). */
  top(out) { return out.set(STATUE.x, PEDESTAL_H + SCALE * 1.28, STATUE.z); }
}
