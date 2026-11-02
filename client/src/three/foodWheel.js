// 🎡 Vòng quay "Hôm nay ăn gì?" 3D: mặt quay 20 ô (vẽ canvas), khung vàng có bóng đèn đuổi nhau, kim đỏ ở đỉnh.
import * as THREE from 'three';
import { Q } from './quality.js';
import { mat } from './avatar.js';

const R = 1.12, CENTER_Y = 1.62, BULBS = 24; // vừa tầm camera khi đứng trước vòng quay
const TEX = { high: 1024, medium: 768, low: 512 }[Q.level];
const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4dabf7', '#f783ac', '#ff922b', '#b197fc', '#63e6be', '#ffa94d', '#74c0fc'];
const TAU = Math.PI * 2;

export class FoodWheel {
  constructor(scene, { x, z, ry }) {
    this.root = new THREE.Group();
    this.root.position.set(x, 0, z);
    this.root.rotation.y = ry;
    scene.add(this.root);
    this.n = 20;
    this.rot = 0;            // góc hiện tại của mặt quay
    this.anim = null;        // { from, to, start, duration }
    this.onTick = null; this.onDone = null;
    this.lastIdx = -1; this.lastTickAt = 0;
    this.build();
  }

  build() {
    const g = this.root;
    const gold = new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: 0.8, roughness: 0.3 });
    const wood = mat('#5a3a24');
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    add(new THREE.CylinderGeometry(0.62, 0.72, 0.2, 24), wood, 0, 0.1, 0);
    add(new THREE.BoxGeometry(0.2, CENTER_Y, 0.2), wood, 0, CENTER_Y / 2 + 0.1, -0.12);
    const rim = add(new THREE.TorusGeometry(R + 0.06, 0.085, 10, 64), gold, 0, CENTER_Y, 0);
    rim.castShadow = false;
    const back = add(new THREE.CircleGeometry(R, 48), mat('#3b2418'), 0, CENTER_Y, -0.03);
    back.rotation.y = Math.PI;
    // mặt quay (texture vẽ khi có danh sách món)
    this.faceMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.15 });
    this.face = add(new THREE.CircleGeometry(R, 64), this.faceMat, 0, CENTER_Y, 0.01);
    this.face.castShadow = false;
    this.face.userData.keepMaterial = true; // texture gán sau → không cho đổi sang vật liệu rẻ
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), gold, 0, CENTER_Y, 0.05).rotation.x = Math.PI / 2;
    // kim chỉ ở đỉnh (chĩa xuống)
    const pin = add(new THREE.ConeGeometry(0.13, 0.32, 3), mat('#e03131', { emissive: '#ff2020', emissiveIntensity: 0.4 }), 0, CENTER_Y + R + 0.05, 0.08);
    pin.rotation.z = Math.PI;
    // bóng đèn quanh khung: 2 nhóm chẵn/lẻ → nháy đuổi nhau (chỉ 2 lần vẽ)
    this.bulbMats = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd166', emissiveIntensity: 1 }));
    const bulbGeo = new THREE.SphereGeometry(0.05, 8, 6);
    this.bulbs = this.bulbMats.map((m, k) => {
      const im = new THREE.InstancedMesh(bulbGeo, m, BULBS / 2);
      for (let i = 0; i < BULBS / 2; i++) {
        const a = ((i * 2 + k) / BULBS) * TAU;
        im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.sin(a) * (R + 0.06), CENTER_Y + Math.cos(a) * (R + 0.06), 0.09));
      }
      im.userData.keepMaterial = true; // đèn nhấp nháy theo vật liệu này
      g.add(im);
      return im;
    });
    // biển hiệu phía trên
    const c = document.createElement('canvas'); c.width = 512; c.height = 112;
    const x = c.getContext('2d');
    x.fillStyle = '#7a1f1f'; x.beginPath(); x.roundRect(4, 4, 504, 104, 26); x.fill();
    x.strokeStyle = '#ffd166'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff3c4'; x.font = 'bold 50px Outfit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('HÔM NAY ĂN GÌ?', 256, 60);
    const signTex = new THREE.CanvasTexture(c); signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = add(new THREE.PlaneGeometry(1.9, 0.42), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }), 0, CENTER_Y + R + 0.48, 0.02);
    sign.castShadow = false;
  }

  /** Vẽ 20 ô món ăn lên mặt quay (thứ tự theo chiều kim đồng hồ từ đỉnh). */
  setFoods(foods) {
    if (this.foods) return;
    this.foods = foods;
    this.n = foods.length;
    const S = TEX, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), cx = S / 2, rr = S / 2 - 2, th = TAU / this.n;
    foods.forEach((f, i) => {
      const a0 = i * th - Math.PI / 2, a1 = a0 + th;
      c.fillStyle = COLORS[i % COLORS.length];
      c.beginPath(); c.moveTo(cx, cx); c.arc(cx, cx, rr, a0, a1); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = S / 300; c.stroke();
      // chữ chạy dọc bán kính, emoji ở mép ngoài
      c.save(); c.translate(cx, cx); c.rotate(a0 + th / 2);
      c.textAlign = 'right'; c.textBaseline = 'middle';
      c.font = `${S * 0.05}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      c.fillText(f.icon, rr * 0.97, 0);
      let size = S * 0.032;
      c.font = `bold ${size}px Outfit, sans-serif`;
      const maxW = rr * 0.6;
      while (c.measureText(f.name).width > maxW && size > S * 0.018) { size -= 1; c.font = `bold ${size}px Outfit, sans-serif`; }
      c.fillStyle = '#2b1a10'; c.fillText(f.name, rr * 0.83, 0);
      c.restore();
    });
    c.fillStyle = '#7a1f1f'; c.beginPath(); c.arc(cx, cx, S * 0.07, 0, TAU); c.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Q.level === 'low' ? 1 : 4;
    this.faceMat.map = tex; this.faceMat.emissiveMap = tex; this.faceMat.needsUpdate = true;
  }

  /** Quay tới ô index (theo chiều kim đồng hồ, ≥6 vòng). elapsed: đã quay được bao lâu (người vào sau). */
  spinTo(index, elapsed, duration) {
    const th = TAU / this.n, center = (index + 0.5) * th;
    const base = this.rot - TAU * 6;
    const to = center + TAU * Math.floor((base - center) / TAU);
    this.anim = { from: this.rot, to, start: performance.now() - elapsed, duration, index };
  }

  get spinning() { return !!this.anim; }

  update(dt, t) {
    const a = this.anim;
    if (a) {
      const p = Math.min(1, (performance.now() - a.start) / a.duration);
      const e = 1 - (1 - p) ** 3; // chậm dần
      this.rot = a.from + (a.to - a.from) * e;
      // tiếng "tạch" mỗi khi kim lướt qua 1 ô
      const th = TAU / this.n, idx = Math.floor(((this.rot % TAU) + TAU) % TAU / th);
      if (idx !== this.lastIdx) { this.lastIdx = idx; if (performance.now() - this.lastTickAt > 45) { this.lastTickAt = performance.now(); this.onTick?.(); } }
      if (p >= 1) { this.anim = null; this.onDone?.(a.index); this.doneAt = t; }
    }
    this.face.rotation.z = this.rot;
    // đèn: quay → nháy đuổi nhanh; vừa trúng → nháy cả 2; bình thường → thở nhẹ
    const fast = !!a, celebrate = this.doneAt && t - this.doneAt < 3;
    const k = fast ? (Math.floor(t * 9) % 2) : celebrate ? (Math.floor(t * 6) % 2) * 2 : -1;
    this.bulbMats[0].emissiveIntensity = k === -1 ? 0.6 + Math.sin(t * 2) * 0.3 : k === 0 || k === 2 ? 2.2 : 0.2;
    this.bulbMats[1].emissiveIntensity = k === -1 ? 0.6 - Math.sin(t * 2) * 0.3 : k === 1 || k === 2 ? 2.2 : 0.2;
  }
}
