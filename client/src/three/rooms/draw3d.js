// 🎨 Xưởng Vẽ 3D: giá vẽ lớn hiển thị bức vẽ trực tiếp; người vẽ vẽ thẳng lên giá bằng chuột.
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomView } from '../roomView.js';
import { roomShell, cushion, tree, mat, CUSHION_SEAT_Y } from '../props.js';

const EASEL_W = 4.4, EASEL_H = 3.3, EASEL_Y = 2.35, EASEL_Z = -2.2;

export class DrawView extends RoomView {
  constructor(engine) {
    super(engine, 'draw');
    this.camPos.set(0, 3.0, 5.6);
    this.camLook.set(0, 2.0, -2);
    this.parallax = 0.15;
    this.drawerId = null;
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#2a2118');
    s.fog = new THREE.Fog('#2a2118', 12, 26);
    s.add(roomShell({ w: 14, d: 13, h: 6, floor: '#8a6440', wall: '#c9b48e' }));
    s.add(new THREE.HemisphereLight('#fff4e0', '#5a4632', 1.2));
    const sky = new THREE.DirectionalLight('#fff1d6', 1.6); // nắng qua cửa sổ mái
    sky.position.set(-5, 9, 4); sky.castShadow = true; sky.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(sky.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sky.shadow.normalBias = 0.03;
    s.add(sky);
    const spot = new THREE.SpotLight('#ffffff', 25, 12, 0.6, 0.5, 1.2);
    spot.position.set(0, 5.5, 1.5); spot.target.position.set(0, EASEL_Y, EASEL_Z);
    s.add(spot, spot.target);

    // Giá vẽ
    const wood = mat('#7a4b2a', { roughness: 0.6 });
    const legGeo = new THREE.BoxGeometry(0.1, 4.6, 0.1);
    for (const [x, rz, rx] of [[-1.5, -0.12, 0.05], [1.5, 0.12, 0.05], [0, 0, -0.35]]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(x, 2.2, EASEL_Z - (rx < 0 ? 0.65 : 0.05)); leg.rotation.set(rx, 0, rz);
      leg.castShadow = true; s.add(leg);
    }
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(EASEL_W + 0.4, 0.1, 0.35), wood);
    ledge.position.set(0, EASEL_Y - EASEL_H / 2 - 0.08, EASEL_Z + 0.12); ledge.castShadow = true;
    const back = new THREE.Mesh(new RoundedBoxGeometry(EASEL_W + 0.16, EASEL_H + 0.16, 0.08, 2, 0.03), mat('#efe6d6'));
    back.position.set(0, EASEL_Y, EASEL_Z - 0.06); back.castShadow = true;
    s.add(ledge, back);
    // Mặt tranh (texture lấy từ canvas vẽ)
    this.paperMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(EASEL_W, EASEL_H), this.paperMat);
    this.paper.position.set(0, EASEL_Y, EASEL_Z);
    s.add(this.paper);

    // Bảng màu, xô sơn, cây
    const palette = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 24), mat('#c8a070'));
    palette.position.set(EASEL_W / 2 - 0.3, EASEL_Y - EASEL_H / 2 - 0.02, EASEL_Z + 0.2);
    s.add(palette);
    ['#e03131', '#1c7ed6', '#fcc419', '#37b24d'].forEach((c, i) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(c, { roughness: 0.2 }));
      dot.scale.y = 0.4; dot.position.set(palette.position.x - 0.18 + i * 0.12, palette.position.y + 0.03, palette.position.z + 0.05);
      s.add(dot);
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 16), mat(c, { roughness: 0.4 }));
      bucket.position.set(-4.5 + i * 0.55, 0.18, -4.6); bucket.castShadow = true; s.add(bucket);
    });
    for (const [x, z] of [[-5.8, -5], [5.8, -5], [5.8, 4.5], [-5.8, 4.5]]) { const t = tree(Math.random, 0.8); t.position.set(x, 0, z); s.add(t); }

    // Chỗ: 0..9 ngồi vòng cung trước giá vẽ; chỗ "người vẽ" đứng cạnh giá
    for (let i = 0; i < 10; i++) {
      const row = i < 5 ? 0 : 1, k = i % 5;
      const order = [2, 1, 3, 0, 4][k];
      const ang = (order - 2) * 0.32, R = 3.4 + row * 1.5;
      const x = Math.sin(ang) * R, z = EASEL_Z + Math.cos(ang) * R + 0.4;
      this.seats.push({ x, z, y: CUSHION_SEAT_Y - 0.05, rot: Math.PI + ang, sit: true });
      const c = cushion(); c.position.set(x, 0, z); s.add(c);
    }
    cheapen(s);
    this.drawerSpot = { x: -(EASEL_W / 2 + 0.75), z: EASEL_Z + 0.7, rot: 0.6, sit: false };
  }

  // Người vẽ đứng cạnh giá, mọi người khác ngồi
  seatFor(id, taken) {
    if (id === this.drawerId) return -100;
    return super.seatFor(id, taken);
  }
  placeAll() {
    super.placeAll();
    const m = this.members.get(this.drawerId);
    if (m) {
      const s = this.drawerSpot;
      m.av.root.position.set(s.x, 0, s.z); m.av.root.rotation.y = s.rot; m.av.faceTo(s.rot); m.av.sitting = false;
    }
  }
  setDrawer(id) { if (id !== this.drawerId) { this.drawerId = id; this.placeAll(); } }

  /**
   * Gắn canvas vẽ (làm texture) và nhận thao tác vẽ từ chuột chiếu lên giá.
   * @param {HTMLCanvasElement} canvas
   * @param {{canDraw: () => boolean, onPointer: (type: 'down'|'move'|'up', u: number, v: number) => void}} api
   */
  attachCanvas(canvas, api) {
    this.api = api;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.paperMat.map = this.tex;
    this.paperMat.needsUpdate = true;
    const cv = this.engine.canvas;
    let drawing = false;
    const uv = (e) => this.engine.pick(e.clientX, e.clientY, [this.paper], false)[0]?.uv;
    this._pd = (e) => {
      if (!this.api.canDraw()) return;
      const p = uv(e); if (!p) return;
      drawing = true; cv.setPointerCapture(e.pointerId);
      this.api.onPointer('down', p.x, 1 - p.y);
    };
    this._pm = (e) => {
      const p = uv(e);
      cv.style.cursor = p && this.api.canDraw() ? 'crosshair' : '';
      if (drawing && p) this.api.onPointer('move', p.x, 1 - p.y);
    };
    this._pu = () => { if (drawing) { drawing = false; this.api.onPointer('up', 0, 0); } };
    this.onActivate = () => { cv.addEventListener('pointerdown', this._pd); cv.addEventListener('pointermove', this._pm); cv.addEventListener('pointerup', this._pu); cv.addEventListener('pointercancel', this._pu); };
    this.onDeactivate = () => { this._pu(); cv.style.cursor = ''; cv.removeEventListener('pointerdown', this._pd); cv.removeEventListener('pointermove', this._pm); cv.removeEventListener('pointerup', this._pu); cv.removeEventListener('pointercancel', this._pu); };
  }

  markDirty() { if (this.tex) this.tex.needsUpdate = true; }
}
