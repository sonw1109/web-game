// 🎲 Sòng Bầu Cua 3D: bàn tròn, chiếu 6 con vật (chạm để cược), bát úp lắc, 3 xúc xắc 3D, chồng phỉnh.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoomView } from '../roomView.js';
import { roomShell, cushion, mat, textCanvas, CUSHION_SEAT_Y } from '../props.js';

const SYMS = [['nai', '🦌', 'Nai'], ['bau', '🍐', 'Bầu'], ['ga', '🐓', 'Gà'], ['ca', '🐟', 'Cá'], ['cua', '🦀', 'Cua'], ['tom', '🦐', 'Tôm']];
const TABLE_Y = 0.72, MAT_W = 2.7, MAT_H = 1.8, MAT_Z = 0.45, PLATE = new THREE.Vector3(0, TABLE_Y, -1.25), DIE = 0.3;
// Xoay để mặt i (thứ tự mặt hộp: +x, −x, +y, −y, +z, −z) hướng lên trời
const FACE_UP = [new THREE.Euler(0, 0, Math.PI / 2), new THREE.Euler(0, 0, -Math.PI / 2), new THREE.Euler(0, 0, 0), new THREE.Euler(Math.PI, 0, 0), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Euler(Math.PI / 2, 0, 0)];

function symbolTexture(icon, name, size = 256) {
  const t = textCanvas(size, size, (c, w, h) => {
    c.fillStyle = '#fbf3e4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c0392b'; c.lineWidth = w * 0.05; c.strokeRect(w * 0.04, h * 0.04, w * 0.92, h * 0.92);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${w * 0.5}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    c.fillText(icon, w / 2, h * 0.44);
    c.fillStyle = '#7a1f1f'; c.font = `bold ${w * 0.15}px Outfit, sans-serif`;
    c.fillText(name, w / 2, h * 0.84);
  });
  t.redraw();
  return t.tex;
}

export class BauCuaView extends RoomView {
  constructor(engine) {
    super(engine, 'baucua');
    this.camPos.set(0, 6.3, 5.6);
    this.camLook.set(0, 0.4, -0.1);
    this.parallax = 0.18;
    this.state = null;
    this.onBet = null;
    this.bowlY = 0.9; this.bowlTarget = 0.9;
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#2a0a0a');
    s.fog = new THREE.Fog('#2a0a0a', 13, 28);
    s.add(roomShell({ w: 14, d: 13, h: 6, floor: '#5a2e1c', wall: '#8e1f1f' }));
    s.add(new THREE.HemisphereLight('#ffe0c0', '#4a1a10', 1.4));
    const key = new THREE.DirectionalLight('#ffd7a0', 1.6);
    key.position.set(3, 9, 6); key.castShadow = Q.shadows; key.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); key.shadow.normalBias = 0.03;
    s.add(key);
    if (Q.extraLights) { const l = new THREE.PointLight('#ffb35c', 12, 8, 1.6); l.position.set(0, 3.2, 0); s.add(l); }

    // Đèn lồng đỏ treo trần + câu đối
    const lanternMat = new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#ff3b1f', emissiveIntensity: 1.3 });
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [0, -4.5]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 14), lanternMat);
      l.scale.y = 1.3; l.position.set(x, 4.3, z); s.add(l);
      const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 8), mat('#ffd166'));
      tassel.position.set(x, 3.7, z); s.add(tassel);
    }
    for (const [x, text] of [[-3.4, 'PHÁT TÀI'], [3.4, 'AN KHANG']]) {
      const t = textCanvas(128, 512, (c, w, h) => {
        c.fillStyle = '#b71c1c'; c.fillRect(0, 0, w, h);
        c.strokeStyle = '#ffd166'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
        c.fillStyle = '#ffd166'; c.font = 'bold 60px Outfit, serif'; c.textAlign = 'center';
        [...text.replace(' ', '')].forEach((ch, i, a) => c.fillText(ch, w / 2, 70 + i * ((h - 100) / a.length)));
      });
      t.redraw();
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.8), new THREE.MeshBasicMaterial({ map: t.tex }));
      banner.position.set(x, 3, -6.45); s.add(banner);
    }

    // Bàn tròn + khăn đỏ
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.12, 48), mat('#7a1010', { roughness: 0.85 }));
    table.position.y = TABLE_Y - 0.06; table.castShadow = table.receiveShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, TABLE_Y - 0.12, 20), mat('#3b1d10'));
    leg.position.y = (TABLE_Y - 0.12) / 2; leg.castShadow = true;
    s.add(table, leg);

    // Chiếu 6 ô (chạm để cược)
    const matTex = textCanvas(1024, 683, (c, w, h) => {
      c.fillStyle = '#fbf3e4'; c.fillRect(0, 0, w, h);
      SYMS.forEach(([, icon, name], i) => {
        const cw = w / 3, ch = h / 2, x = (i % 3) * cw, y = Math.floor(i / 3) * ch;
        c.strokeStyle = '#c0392b'; c.lineWidth = 8; c.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `${ch * 0.5}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        c.fillText(icon, x + cw / 2, y + ch * 0.45);
        c.fillStyle = '#7a1f1f'; c.font = `bold ${ch * 0.15}px Outfit, sans-serif`;
        c.fillText(name.toUpperCase(), x + cw / 2, y + ch * 0.85);
      });
    });
    matTex.redraw();
    this.mat = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W, MAT_H), new THREE.MeshStandardMaterial({ map: matTex.tex, roughness: 0.9 }));
    this.mat.rotation.x = -Math.PI / 2; this.mat.position.set(0, TABLE_Y + 0.004, MAT_Z); this.mat.receiveShadow = true;
    s.add(this.mat);
    // Ô trúng phát sáng + chồng phỉnh
    this.cellCenter = (i) => new THREE.Vector3(((i % 3) - 1) * (MAT_W / 3), TABLE_Y, MAT_Z + (Math.floor(i / 3) - 0.5) * (MAT_H / 2));
    const glowMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glows = SYMS.map((_, i) => {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(MAT_W / 3 - 0.06, MAT_H / 2 - 0.06), glowMat);
      g.rotation.x = -Math.PI / 2; g.position.copy(this.cellCenter(i)).y += 0.01; g.visible = false;
      s.add(g); return g;
    });
    const MAX_COINS = 12;
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 20), new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.7, roughness: 0.3 }), SYMS.length * MAX_COINS);
    this.coins.castShadow = true;
    this.coins.count = 0;
    s.add(this.coins);
    this.maxCoins = MAX_COINS;

    // Đĩa + bát + 3 xúc xắc
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.06, 40), mat('#f4f1ea', { roughness: 0.3 }));
    plate.position.copy(PLATE).y += 0.03; plate.castShadow = plate.receiveShadow = true;
    s.add(plate);
    const faceMats = SYMS.map(([, icon, name]) => new THREE.MeshStandardMaterial({ map: symbolTexture(icon, name), roughness: 0.45 }));
    const dieGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 3, 0.04);
    this.dice = [0, 1, 2].map((i) => {
      const d = new THREE.Mesh(dieGeo, faceMats);
      d.userData.keepMaterial = true; // giữ texture mặt xúc xắc (cheapen bỏ qua mảng vật liệu)
      d.castShadow = true;
      const a = (i / 3) * Math.PI * 2 + 0.4;
      d.userData.home = new THREE.Vector3(PLATE.x + Math.cos(a) * 0.22, PLATE.y + 0.06 + DIE / 2, PLATE.z + Math.sin(a) * 0.22);
      d.position.copy(d.userData.home);
      d.rotation.copy(FACE_UP[(i * 2) % 6]);
      s.add(d);
      return d;
    });
    this.bowl = new THREE.Group();
    const bowlMesh = new THREE.Mesh(new THREE.SphereGeometry(0.58, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2f6fb3', roughness: 0.25, side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 40), mat('#f4f1ea'));
    rim.rotation.x = Math.PI / 2;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.1, 20), mat('#f4f1ea'));
    knob.position.y = 0.6;
    this.bowl.add(bowlMesh, rim, knob);
    this.bowl.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.bowl.position.set(PLATE.x, PLATE.y + this.bowlY + 0.06, PLATE.z);
    s.add(this.bowl);

    // Chỗ ngồi quanh bàn (chỗ 0 ngay trước chiếu, phía camera)
    const R = 3.1;
    const angles = [90, 50, 130, 15, 165, -20, 200, -55, 235];
    for (const deg of angles) {
      const a = THREE.MathUtils.degToRad(deg);
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      this.seats.push({ x, z, y: CUSHION_SEAT_Y - 0.05, rot: Math.atan2(-x, -z), sit: true });
      const c = cushion(); c.position.set(x, 0, z); c.rotation.y = Math.atan2(-x, -z); s.add(c);
    }
    cheapen(s);

    // Chạm ô trên chiếu để cược
    const cv = this.engine.canvas;
    let down = null;
    this._pd = (e) => { down = { x: e.clientX, y: e.clientY }; };
    this._pu = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const i = this.cellAt(e.clientX, e.clientY);
      if (i >= 0) this.onBet?.(SYMS[i][0]);
    };
    this._pm = (e) => { cv.style.cursor = this.state?.phase === 'betting' && this.cellAt(e.clientX, e.clientY) >= 0 ? 'pointer' : ''; };
    this.onActivate = () => { cv.addEventListener('pointerdown', this._pd); cv.addEventListener('pointerup', this._pu); cv.addEventListener('pointermove', this._pm); };
    this.onDeactivate = () => { cv.removeEventListener('pointerdown', this._pd); cv.removeEventListener('pointerup', this._pu); cv.removeEventListener('pointermove', this._pm); cv.style.cursor = ''; };
  }

  cellAt(cx, cy) {
    const uv = this.engine.pick(cx, cy, [this.mat], false)[0]?.uv;
    if (!uv) return -1;
    return Math.min(2, Math.floor(uv.x * 3)) + (uv.y > 0.5 ? 0 : 3);
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    // phỉnh: chiều cao chồng theo tổng cược mỗi ô
    const m = new THREE.Matrix4();
    let n = 0;
    SYMS.forEach(([id], i) => {
      const count = Math.min(this.maxCoins, Math.ceil((s.totals[id] || 0) / 50));
      const c = this.cellCenter(i);
      for (let k = 0; k < count; k++) { m.makeTranslation(c.x + 0.28, TABLE_Y + 0.02 + k * 0.036, c.z - 0.12); this.coins.setMatrixAt(n++, m); }
    });
    this.coins.count = n;
    this.coins.instanceMatrix.needsUpdate = true;
    // bát: lắc thì úp xuống, có kết quả thì mở lên
    this.bowlTarget = s.phase === 'rolling' ? 0 : s.phase === 'result' ? 1.1 : 0.9;
    if (s.phase === 'result' && prev?.phase !== 'result' && s.dice) {
      s.dice.forEach((sym, i) => {
        const d = this.dice[i];
        d.rotation.copy(FACE_UP[SYMS.findIndex(([id]) => id === sym)]);
        d.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
        d.position.copy(d.userData.home);
      });
      for (const [id, delta] of Object.entries(s.lastDelta)) if (delta > 0) this.member(id)?.av.jump();
    }
    this.glows.forEach((g, i) => { g.visible = s.phase === 'result' && !!s.dice?.includes(SYMS[i][0]); });
  }

  onUpdate(dt, t) {
    this.bowlY += (this.bowlTarget - this.bowlY) * Math.min(1, dt * 6);
    const rolling = this.state?.phase === 'rolling' && this.bowlY < 0.08;
    const shake = rolling ? Math.sin(t * 38) * 0.06 : 0;
    this.bowl.position.set(PLATE.x + shake, PLATE.y + 0.06 + this.bowlY, PLATE.z + (rolling ? Math.cos(t * 31) * 0.04 : 0));
    if (rolling) for (const d of this.dice) { d.rotation.x += dt * 9; d.rotation.y += dt * 7; } // lăn lộc cộc trong bát
    const glow = 0.4 + Math.sin(t * 5) * 0.2;
    for (const g of this.glows) g.material.opacity = glow;
  }
}
