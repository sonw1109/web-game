// 🎬 Rạp phim 3D: màn chiếu thật (YouTube nhúng qua CSS3D), rèm nhung, bồ đoàn, đèn dịu khi chiếu.
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { RoomView } from '../roomView.js';
import { roomShell, cushion, candle, flicker, mat, CUSHION_SEAT_Y } from '../props.js';

const SCREEN_W = 9.6, SCREEN_H = 5.4, SCREEN_Y = 3.15, SCREEN_Z = -6.85;
const PX_W = 1280, PX_H = 720;

function curtain(width, height, color) {
  const geo = new THREE.PlaneGeometry(width, height, 40, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.12);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export class CinemaView extends RoomView {
  constructor(engine) {
    super(engine, 'cinema');
    this.camPos.set(0, 4.3, 10.2);
    this.camLook.set(0, 2.2, -5);
    this.parallax = 0.25;
    this.dim = 0; this.dimTarget = 0;
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#1a0b0b');
    s.fog = new THREE.Fog('#1a0b0b', 14, 30);
    s.add(roomShell({ w: 16, d: 15, h: 7, floor: '#4a2d1d', wall: '#5a1f1f' }));
    this.scene.children[0].position.z = 0.5;

    // Ánh sáng
    this.hemi = new THREE.HemisphereLight('#ffd9b0', '#2a1410', 0.9);
    this.key = new THREE.DirectionalLight('#ffcc99', 1.4);
    this.key.position.set(4, 9, 6); this.key.castShadow = true;
    this.key.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(this.key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    this.key.shadow.normalBias = 0.03;
    // ánh sáng hắt ra từ màn chiếu
    this.screenLight = new THREE.SpotLight('#cfe0ff', 0, 18, 0.9, 0.8, 1.2);
    this.screenLight.position.set(0, SCREEN_Y, SCREEN_Z + 0.3);
    this.screenLight.target.position.set(0, 0, 6);
    s.add(this.hemi, this.key, this.screenLight, this.screenLight.target);

    // Sân khấu + khung màn chiếu
    const stage = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 2), mat('#3b2216'));
    stage.position.set(0, 0.22, SCREEN_Z + 0.6); stage.receiveShadow = stage.castShadow = true;
    s.add(stage);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.5, SCREEN_H + 0.5, 0.18), mat('#120a08', { roughness: 0.4 }));
    frame.position.set(0, SCREEN_Y, SCREEN_Z - 0.1);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.7, 0.12, 0.25), mat('#d4a64a', { metalness: 0.8, roughness: 0.3 }));
    trim.position.set(0, SCREEN_Y + SCREEN_H / 2 + 0.3, SCREEN_Z - 0.05);
    const trim2 = trim.clone(); trim2.position.y = SCREEN_Y - SCREEN_H / 2 - 0.3;
    s.add(frame, trim, trim2);

    // "Lỗ" trên canvas WebGL để lộ YouTube (lớp CSS3D nằm bên dưới)
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false, blending: THREE.NoBlending }));
    hole.position.set(0, SCREEN_Y, SCREEN_Z);
    s.add(hole);
    this.cssScene = new THREE.Scene();
    this.cssHolder = document.createElement('div');
    Object.assign(this.cssHolder.style, { width: `${PX_W}px`, height: `${PX_H}px`, background: '#000' });
    const obj = new CSS3DObject(this.cssHolder);
    obj.position.copy(hole.position);
    obj.scale.setScalar(SCREEN_W / PX_W);
    this.cssScene.add(obj);

    // Rèm nhung
    for (const side of [-1, 1]) {
      const c = curtain(2.4, 6.6, '#8e1b1b');
      c.position.set(side * (SCREEN_W / 2 + 1.0), 3.3, SCREEN_Z + 0.25);
      s.add(c);
    }
    const valance = curtain(SCREEN_W + 4.5, 0.9, '#8e1b1b');
    valance.position.set(0, SCREEN_Y + SCREEN_H / 2 + 0.85, SCREEN_Z + 0.3);
    s.add(valance);

    // Nến 2 bên sân khấu + đèn tường
    this.candles = [];
    for (const x of [-5.3, -4.6, 4.6, 5.3]) {
      const c = candle(0.5 + Math.random() * 0.3);
      c.position.set(x, 0.45, SCREEN_Z + 1.1);
      s.add(c); this.candles.push(c);
    }
    for (const side of [-1, 1]) for (const z of [-2, 2.5]) {
      const sconce = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffd59a', emissive: '#ffae5c', emissiveIntensity: 2 }));
      sconce.position.set(side * 7.85, 3.2, z);
      s.add(sconce);
      this.sconces ||= [];
      if (Q.extraLights) {
        const l = new THREE.PointLight('#ffae5c', 3, 6, 2);
        l.position.copy(sconce.position).x -= side * 0.4;
        s.add(l); this.sconces.push(l);
      }
    }

    // Bồ đoàn: 3 hàng × 5
    const rows = [0.4, 2.6, 4.8], cols = [-4.4, -2.2, 0, 2.2, 4.4];
    // chỗ 0 = hàng giữa, chính giữa (ngay trước camera)
    const order = [[1, 2], [1, 1], [1, 3], [0, 2], [0, 1], [0, 3], [2, 2], [2, 1], [2, 3], [1, 0], [1, 4], [0, 0], [0, 4], [2, 0], [2, 4]];
    for (const [r, c] of order) {
      const cu = cushion();
      cu.position.set(cols[c], 0, rows[r]);
      s.add(cu);
      this.seats.push({ x: cols[c], z: rows[r], y: CUSHION_SEAT_Y - 0.05, rot: Math.PI, sit: true });
    }
    cheapen(s);
  }

  // Nhân vật ngồi quay mặt về màn chiếu (−z)
  placeAll() { super.placeAll(); for (const m of this.members.values()) { m.av.root.rotation.y = Math.PI; m.av.faceTo(Math.PI); } }

  /** Gắn khung YouTube (#cinema-screen) lên màn chiếu 3D. */
  attachScreen(el) {
    this.screenEl = el;
    this.screenHome = { parent: el.parentElement, next: el.nextSibling };
    el.classList.add('in-3d');
    this.cssHolder.append(el);
  }
  detachScreen() {
    const el = this.screenEl;
    if (!el) return;
    el.classList.remove('in-3d');
    this.screenHome.parent.insertBefore(el, this.screenHome.next);
    this.screenEl = null;
  }

  /** Phim đang chạy → tắt bớt đèn như rạp thật. */
  setPlaying(playing) { this.dimTarget = playing ? 1 : 0; }

  onUpdate(dt, t) {
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 1.5);
    const k = 1 - this.dim * 0.75;
    this.hemi.intensity = 0.9 * k + 0.08;
    this.key.intensity = 1.4 * k;
    for (const l of this.sconces) l.intensity = 3 * (1 - this.dim * 0.6);
    this.screenLight.intensity = this.dim * (22 + Math.sin(t * 3) * 3 + Math.sin(t * 7.7) * 2);
    this.candles.forEach((c, i) => flicker(c, t, i));
  }
}
