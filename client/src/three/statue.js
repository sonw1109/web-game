// 🙏 Tượng đài "Ông Chủ Hội Quán": tượng chibi dát vàng cao ~8m – tóc đen bù xù, kính gọng bạc to,
// mặt tròn, mắt lim dim, môi chu, tay phải giơ lên ban phước. Phía trước có bàn thờ, bát hương,
// đèn nến, mâm ngũ quả, ống xin quẻ và 3 chiếu quỳ.
// Các phần cùng vật liệu được gộp thành 1 khối → cả tượng chỉ tốn vài lần vẽ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from './quality.js';
import { STATUE, ALTAR, MATS } from '../game/map.js';
import FACE_URL from '../assets/ong-chu-face.jpg';

const SCALE = 5.2;           // tượng = nhân vật × 5.2
const PEDESTAL_H = 1.8;
const LOTUS_H = 0.42;        // đài sen trên bệ
const STAND_Y = PEDESTAL_H + LOTUS_H;
const MAX_STICKS = 12;

function M(color, o = {}) {
  if (!Q.cheapMaterials) return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });
  // Lambert không có roughness/metalness; chỉ chép những khóa có giá trị (khóa undefined làm three.js cảnh báo)
  const opts = { color };
  for (const k of ['emissive', 'emissiveIntensity', 'transparent', 'opacity']) if (o[k] !== undefined) opts[k] = o[k];
  return new THREE.MeshLambertMaterial(opts);
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

/** Tượng (đơn vị = kích thước nhân vật, mặt hướng +z, tay phải ở phía -x). */
function statueBody(bk, mats) {
  const { gold, shirt, hair, pants, white, ingot } = mats;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const LIMB = new THREE.CapsuleGeometry(0.5, 1, 6, 14); // cao 2, bán kính 0.5
  /** Đoạn chi tròn nối a → b, bán kính r. */
  const limb = (mat, a, b, r) => {
    const A = V(...a), B = V(...b), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    bk.add(mat, LIMB, { p: A.clone().add(B).multiplyScalar(0.5).toArray(), s: [r * 2, len / 2, r * 2], q });
  };
  const ball = (mat, p, r) => bk.add(mat, SPH, { p, s: typeof r === 'number' ? [r, r, r] : r });

  // ---- giày sneaker (đế trắng, thân đen, dây trắng) + quần ----
  for (const s of [-1, 1]) {
    const x = s * 0.088;
    bk.add(white, new THREE.CapsuleGeometry(0.5, 1, 4, 12), { p: [x, 0.018, 0.035], s: [0.12, 0.08, 0.06], r: [Math.PI / 2, 0, 0] });
    ball(hair, [x, 0.05, 0.03], [0.062, 0.045, 0.1]);
    ball(hair, [x, 0.06, -0.02], [0.058, 0.055, 0.07]);
    for (let k = 0; k < 3; k++) bk.add(white, BOX, { p: [x, 0.083 - k * 0.006, 0.07 + k * 0.022], s: [0.05, 0.006, 0.008], r: [-0.5, 0, 0] });
    limb(pants, [x, 0.08, 0], [x * 1.05, 0.21, 0], 0.07);
    bk.add(pants, new THREE.TorusGeometry(1, 0.15, 6, 18), { p: [x, 0.085, 0], s: 0.072, r: [Math.PI / 2, 0, 0] }); // gấu quần
  }
  // ---- áo thun: thân + gấu áo + cổ tròn + tay áo ngắn ----
  bk.add(shirt, new THREE.LatheGeometry([[0, 0.18], [0.215, 0.18], [0.245, 0.215], [0.258, 0.3], [0.25, 0.4], [0.225, 0.47], [0.17, 0.525], [0.09, 0.555], [0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y)), 32));
  bk.add(shirt, new THREE.TorusGeometry(1, 0.06, 6, 32), { p: [0, 0.195, 0], s: [0.235, 0.235, 0.235], r: [Math.PI / 2, 0, 0] });
  bk.add(shirt, new THREE.TorusGeometry(1, 0.18, 8, 28), { p: [0, 0.548, 0.006], s: [0.082, 0.082, 0.07], r: [Math.PI / 2 - 0.15, 0, 0] });
  // vai tròn
  for (const s of [-1, 1]) ball(shirt, [s * 0.19, 0.475, 0], [0.085, 0.075, 0.08]);

  // ---- tay phải (-x) giơ lên ban phước: vai → khuỷu → cổ tay, lòng bàn tay hướng ra trước ----
  const rS = [-0.21, 0.47, 0.0], rE = [-0.33, 0.43, 0.07], rW = [-0.335, 0.63, 0.13];
  limb(shirt, rS, [-0.27, 0.45, 0.035], 0.07);                     // tay áo
  limb(gold, [-0.26, 0.45, 0.03], rE, 0.046);                      // bắp tay
  ball(gold, rE, 0.046);                                           // khuỷu
  limb(gold, rE, rW, 0.041);                                       // cẳng tay
  const palmR = V(-0.335, 0.685, 0.14);
  bk.add(gold, new THREE.CapsuleGeometry(0.5, 0.4, 4, 10), { p: palmR.toArray(), s: [0.085, 0.07, 0.03], r: [0, 0, 0] }); // lòng bàn tay
  [-1.5, -0.5, 0.5, 1.5].forEach((k, i) => { // 4 ngón khép, hơi xòe
    const x = palmR.x + k * 0.019, len = [0.05, 0.058, 0.055, 0.045][i];
    limb(gold, [x, palmR.y + 0.035, palmR.z], [x + k * 0.004, palmR.y + 0.035 + len, palmR.z - 0.004], 0.0105);
  });
  limb(gold, [palmR.x + 0.03, palmR.y - 0.015, palmR.z], [palmR.x + 0.062, palmR.y + 0.02, palmR.z + 0.01], 0.012); // ngón cái

  // ---- tay trái (+x) nâng thỏi vàng trước bụng ----
  const lS = [0.21, 0.47, 0.0], lE = [0.29, 0.36, 0.06], lW = [0.13, 0.31, 0.2];
  limb(shirt, lS, [0.26, 0.42, 0.03], 0.07);
  limb(gold, [0.25, 0.43, 0.025], lE, 0.046);
  ball(gold, lE, 0.046);
  limb(gold, lE, lW, 0.041);
  ball(gold, [0.1, 0.3, 0.22], [0.06, 0.035, 0.055]);             // lòng bàn tay ngửa
  for (let i = 0; i < 4; i++) limb(gold, [0.075 - i * 0.012, 0.3, 0.255], [0.06 - i * 0.012, 0.325, 0.27], 0.01); // ngón cong đỡ thỏi vàng
  // thỏi vàng (nén bạc kiểu thuyền) + ánh lấp lánh
  bk.add(ingot, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { p: [0.09, 0.345, 0.225], s: [0.085, 0.04, 0.05], r: [Math.PI, 0, 0] });
  bk.add(ingot, new THREE.TorusGeometry(1, 0.22, 8, 20), { p: [0.09, 0.345, 0.225], s: [0.075, 0.042, 0.04], r: [Math.PI / 2, 0, 0] });
  ball(ingot, [0.09, 0.36, 0.225], [0.04, 0.03, 0.03]);
  for (const s of [-1, 1]) ball(ingot, [0.09 + s * 0.072, 0.365, 0.225], [0.022, 0.03, 0.03]); // hai đầu vểnh

  // ---- cổ + đầu ----
  bk.add(gold, CYL, { p: [0, 0.585, 0], s: [0.072, 0.07, 0.068] });
  const H = [0, 0.84, 0];
  const at = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  bk.add(gold, SPH, { p: H, s: [0.33, 0.31, 0.31] });
  for (const s of [-1, 1]) {
    ball(gold, at(s * 0.322, -0.02, 0.0), [0.042, 0.075, 0.05]);  // vành tai
    ball(gold, at(s * 0.335, -0.02, 0.005), [0.02, 0.045, 0.03]);
  }
  // ---- tai nghe có dây (như trong ảnh) ----
  for (const s of [-1, 1]) {
    ball(white, at(s * 0.333, -0.035, 0.02), [0.026, 0.024, 0.026]);
    // dây chạy dọc sau quai hàm (không vắt ngang mặt) rồi xuống trước ngực
    limb(white, at(s * 0.335, -0.05, 0.0), at(s * 0.3, -0.2, -0.04), 0.0055);
    limb(white, at(s * 0.3, -0.2, -0.04), at(s * 0.17, -0.3, 0.05), 0.0055);
    limb(white, at(s * 0.17, -0.3, 0.05), [s * 0.1, 0.52, 0.17], 0.0055);
    limb(white, [s * 0.1, 0.52, 0.17], [s * 0.03, 0.45, 0.205], 0.0055);
  }
  limb(white, [0, 0.45, 0.21], [0.015, 0.3, 0.24], 0.006);
  ball(white, [0, 0.45, 0.21], 0.012); // chỗ nối 2 dây

  // ---- tóc đen bù xù: chỏm + 2 lớp lọn tóc + mái lòa xòa ----
  bk.add(hair, new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), { p: at(0, 0.015, -0.02), s: [0.348, 0.345, 0.345], r: [-0.4, 0, 0] });
  const TUFT = new THREE.ConeGeometry(1, 1, 7); TUFT.translate(0, 0.5, 0);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tuft = (dir, len, w, twist = 0.35) => {
    const base = dir.clone().multiplyScalar(0.29);
    const out = dir.clone().add(V((rnd() - 0.5) * twist, 0.1 + rnd() * 0.15, (rnd() - 0.5) * twist - 0.25)).normalize(); // lọn tóc rạp ra sau, không dựng đứng
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), out);
    bk.add(hair, TUFT, { p: at(base.x, base.y + 0.01, base.z), s: [w, len, w * 0.6], q });
  };
  for (let i = 0; i < 80; i++) { // lọn tóc phủ đỉnh & sau gáy
    const a = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.25;
    const dir = V(Math.cos(a) * Math.sin(el), Math.cos(el), Math.sin(a) * Math.sin(el) - 0.18).normalize();
    if (dir.z > 0.45 && dir.y < 0.75) continue; // chừa mặt
    tuft(dir, 0.06 + rnd() * 0.06, 0.05 + rnd() * 0.03);
  }
  for (let i = 0; i < 9; i++) { // mái trước trán, chải lệch sang phải
    const x = -0.2 + i * 0.05;
    const dir = V(x * 1.6, 0.62, 0.62).normalize();
    const base = dir.clone().multiplyScalar(0.3);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(-0.55 - rnd() * 0.25, -0.35, 0.75).normalize());
    bk.add(hair, TUFT, { p: at(base.x, base.y + 0.02, base.z), s: [0.055, 0.08 + rnd() * 0.03, 0.03], q });
  }
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { // tóc mai
    const dir = V(s * 0.85, 0.35 - k * 0.12, 0.25).normalize();
    const base = dir.clone().multiplyScalar(0.31);
    bk.add(hair, TUFT, { p: at(base.x, base.y, base.z), s: [0.04, 0.08, 0.025], q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(s * 0.2, -1, 0.15).normalize()) });
  }
}

/** Đài sen vàng dưới chân tượng (đơn vị mét). */
function lotus(bk, petal, petalIn, core) {
  const P = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  bk.add(core, new THREE.CylinderGeometry(1.15, 1.25, 0.22, 24), { p: [0, 0.11, 0] });
  for (const [n, r, tilt, sc, y, mat, off] of [[16, 1.18, 0.95, [0.36, 0.42, 0.14], 0.06, petal, 0], [12, 0.92, 0.55, [0.32, 0.4, 0.12], 0.12, petalIn, 0.26]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, 0, 'YXZ'));
      bk.add(mat, P, { p: [Math.sin(a) * r, y, Math.cos(a) * r], s: sc, q });
    }
  }
  bk.add(core, new THREE.CylinderGeometry(0.95, 1.0, 0.12, 24), { p: [0, 0.36, 0] });
}

/** Mảnh cong ôm phía trước đầu tượng, dán ảnh mặt thật (viền mờ dần vào lớp vàng). */
function faceDecal() {
  // đầu tượng là khối cầu co giãn (0.33, 0.31, 0.31) tâm (0, 0.84, 0) → mảnh cầu cùng tỉ lệ, nhô ra 1%
  const geo = new THREE.SphereGeometry(1, 28, 24, Math.PI / 2 - 0.74, 1.48, 0.86, 1.62);
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    // làm mờ viền theo hình bầu dục
    c.globalCompositeOperation = 'destination-in';
    const g = c.createRadialGradient(cv.width / 2, cv.width / 2, cv.width * 0.3, cv.width / 2, cv.width / 2, cv.width * 0.56); // (tọa độ trước khi giãn dọc)
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.setTransform(1, 0, 0, cv.height / cv.width, 0, 0); // giãn gradient theo chiều dọc thành bầu dục
    c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.width);
    tex.image = cv; tex.needsUpdate = true;
  };
  img.src = FACE_URL;
  const opts = { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 };
  const mat = Q.cheapMaterials ? new THREE.MeshLambertMaterial(opts) : new THREE.MeshStandardMaterial({ ...opts, roughness: 0.6 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, 0.84, 0); m.scale.set(0.336, 0.316, 0.316);
  m.userData.keepMaterial = true;
  return m;
}

export class Shrine {
  constructor(scene) {
    this.scene = scene;
    const root = (this.root = new THREE.Group());
    scene.add(root);
    const gold = M('#f4c75e', { metalness: 0.75, roughness: 0.3, emissive: '#8a5c08', emissiveIntensity: 0.45 }); // tự sáng nhẹ để mặt tượng không tối khi khuất nắng
    this.gold = gold;
    const mats = {
      gold, shirt: M('#24201d', { metalness: 0.55, roughness: 0.38 }), hair: M('#15110e', { roughness: 0.35, metalness: 0.3 }),
      pants: M('#3a3a42', { metalness: 0.4, roughness: 0.5 }), white: M('#f4f1ea', { roughness: 0.45 }),
      ingot: M('#ffd447', { metalness: 0.95, roughness: 0.15, emissive: '#b8860b', emissiveIntensity: 0.6 }),
    };
    // bệ đá 3 tầng
    const stone = M('#bcb3a6', { roughness: 0.85 }), stoneDark = M('#8f877c', { roughness: 0.9 });
    const ped = new Baker();
    ped.add(stoneDark, new THREE.CylinderGeometry(2.3, 2.45, 0.45, 8), { p: [0, 0.22, 0] });
    ped.add(stone, new THREE.CylinderGeometry(1.75, 1.95, 1.05, 8), { p: [0, 0.97, 0] });
    ped.add(stoneDark, new THREE.CylinderGeometry(1.55, 1.6, 0.3, 8), { p: [0, PEDESTAL_H - 0.15, 0] });
    const trim = M('#d9a94a', { metalness: 0.85, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.3 });
    for (const [r, y] of [[2.38, 0.45], [1.8, 1.5], [1.58, PEDESTAL_H]]) ped.add(trim, new THREE.TorusGeometry(r, 0.035, 6, 8), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }); // viền vàng
    const lot = new Baker();
    lotus(lot, M('#f3c6a0', { metalness: 0.6, roughness: 0.3, emissive: '#7a3a20', emissiveIntensity: 0.25 }), M('#f8dca0', { metalness: 0.7, roughness: 0.28, emissive: '#7a5410', emissiveIntensity: 0.3 }), trim);
    const lotusG = lot.build(new THREE.Group());
    lotusG.position.set(STATUE.x, PEDESTAL_H, STATUE.z);
    root.add(lotusG);
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
    st.add(faceDecal());
    st.scale.setScalar(SCALE);
    st.position.set(STATUE.x, STAND_Y, STATUE.z);
    st.rotation.y = Math.PI / 2; // mặt hướng đông (lối vào)
    root.add(st);
    this.statue = st;
    // vầng hào quang sau đầu
    const halo = (this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.022, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.75 })));
    halo.position.set(0, 0.97, -0.34); halo.userData.keepMaterial = true;
    st.add(halo);
    const glow = (this.glowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.12, depthWrite: false })));
    glow.position.set(0, 0.97, -0.35); glow.userData.keepMaterial = true;
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
      this.statue.position.y = STAND_Y + Math.abs(Math.sin(t * 6)) * 0.25 * k;
      this.statue.rotation.y = Math.PI / 2 + Math.sin(t * 9) * 0.06 * k;
      const sc = 1 + Math.sin(t * 4) * 0.3 * k;
      this.halo.scale.setScalar(sc); this.glowDisc.scale.setScalar(sc * 1.2);
    } else if (this.statue.position.y !== STAND_Y) { this.statue.position.y = STAND_Y; this.statue.rotation.y = Math.PI / 2; this.halo.scale.setScalar(1); this.glowDisc.scale.setScalar(1); }
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
  top(out) { return out.set(STATUE.x, STAND_Y + SCALE * 1.3, STATUE.z); }
}
