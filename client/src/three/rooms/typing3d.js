// ⌨️ Đường đua 3D: mỗi tay đua chạy trên 1 làn theo % câu đã gõ.
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoomView } from '../roomView.js';
import { mat, textures, canvasTex, textCanvas, tree } from '../props.js';
import { store } from '../../store.js';

const LANES = 8, LANE_W = 1.1, START_X = -8.5, LEN = 17;
const laneZ = (i) => (i - (LANES - 1) / 2) * LANE_W;
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export class TypingView extends RoomView {
  constructor(engine) {
    super(engine, 'typing');
    this.camPos.set(1.5, 7.2, 11.5);
    this.camLook.set(0.5, 0, -0.5);
    this.parallax = 0.25;
    this.state = null;
    this.local = new Map(); // id -> tiến độ cục bộ (của mình) để chạy mượt trước khi server xác nhận
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#9ccfee');
    s.fog = new THREE.Fog('#9ccfee', 26, 60);
    s.add(new THREE.HemisphereLight('#ffffff', '#5a7a3a', 1.3));
    const sun = new THREE.DirectionalLight('#fff3d6', 2.2);
    sun.position.set(-6, 14, 8); sun.castShadow = Q.shadows; sun.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10 }); sun.shadow.normalBias = 0.03;
    s.add(sun);

    const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ map: textures.grass([24, 18]), roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; grass.receiveShadow = true;
    s.add(grass);
    // Mặt đường đua có vạch làn
    const trackTex = canvasTex(512, (c, n) => {
      c.fillStyle = '#c4553a'; c.fillRect(0, 0, n, n);
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; c.fillRect(Math.random() * n, Math.random() * n, 2, 2); }
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i <= LANES; i++) c.fillRect(0, (i / LANES) * n - 2, n, 4);
    }, [1, 1]);
    const track = new THREE.Mesh(new THREE.PlaneGeometry(LEN + 4, LANES * LANE_W), new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.9 }));
    track.rotation.x = -Math.PI / 2; track.position.set(START_X + LEN / 2, 0.005, 0); track.receiveShadow = true;
    s.add(track);
    // Vạch xuất phát + cổng đích ca-rô
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(0.15, LANES * LANE_W), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    startLine.rotation.x = -Math.PI / 2; startLine.position.set(START_X, 0.01, 0);
    const checker = canvasTex(128, (c, n) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect((x * n) / 8, (y * n) / 8, n / 8, n / 8); } }, [1, 6]);
    const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, LANES * LANE_W), new THREE.MeshBasicMaterial({ map: checker }));
    finishLine.rotation.x = -Math.PI / 2; finishLine.position.set(START_X + LEN, 0.01, 0);
    s.add(startLine, finishLine);
    const pole = mat('#eeeeee', { metalness: 0.4, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 12), pole);
      p.position.set(START_X + LEN, 1.7, side * (LANES * LANE_W / 2 + 0.3)); p.castShadow = true; s.add(p);
    }
    // băng rôn dài & mỏng → canvas dài theo tỉ lệ thật để chữ không bị kéo dẹt
    const bannerTex = textCanvas(1024, 96, (c, w, h) => {
      c.fillStyle = '#ff5f6d'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = 'bold 64px "Pixelify Sans", Outfit, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('🏁  VỀ ĐÍCH  🏁', w / 2, h / 2 + 4);
    });
    bannerTex.redraw();
    const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTex.tex });
    // mặt ±x là 2 mặt lớn nhìn thấy được (thứ tự mặt hộp: +x, −x, +y, −y, +z, −z)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, LANES * LANE_W + 0.6), [bannerMat, bannerMat, pole, pole, pole, pole]);
    banner.position.set(START_X + LEN, 3.2, 0); banner.rotation.y = 0;
    s.add(banner);
    // Khán đài phía sau
    const standMat = mat('#8a8f9c', { roughness: 0.8 });
    for (let k = 0; k < 4; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(LEN + 4, 0.4, 0.9), standMat);
      step.position.set(START_X + LEN / 2, 0.2 + k * 0.4, -LANES * LANE_W / 2 - 1.2 - k * 0.9); step.castShadow = step.receiveShadow = true;
      s.add(step);
    }
    for (const [x, z] of [[-13, -8], [13, -8], [-14, 6], [14, 5], [-11, 9], [10, 9]]) { const t = tree(Math.random, 1.3); t.position.set(x, 0, z); s.add(t); }

    // Chỗ: 0..7 = làn đua; 8.. = khán giả trên khán đài
    for (let i = 0; i < LANES; i++) this.seats.push({ x: START_X - 0.5, z: laneZ(i), rot: Math.PI / 2, sit: false });
    for (let k = 0; k < 16; k++) {
      const row = k % 2, col = Math.floor(k / 2);
      this.seats.push({ x: START_X + 1 + col * 2, z: -LANES * LANE_W / 2 - 1.2 - row * 0.9, y: 0.4 + row * 0.4, rot: 0, sit: false });
    }
    cheapen(s);
  }

  /** Tay đua lên làn theo thứ tự trong cuộc đua; người khác ngồi khán đài. */
  seatFor(id, taken) {
    const racers = this.state?.racers || [];
    const lane = racers.findIndex((r) => r.id === id);
    if (lane >= 0 && lane < LANES) return lane;
    if (!racers.length && !taken.has(0) && id === store.selfId) return 0;
    for (let i = LANES; i < this.seats.length; i++) if (!taken.has(i)) return i;
    return -1;
  }

  setState(s) {
    const prevKey = (this.state?.racers || []).map((r) => r.id).join(',');
    const newRace = s.phase === 'countdown' && this.state?.phase !== 'countdown';
    if (newRace) this.local.clear();
    this.state = s;
    // cuộc đua mới (kể cả cùng người) → mọi người về vạch xuất phát
    if (newRace || prevKey !== s.racers.map((r) => r.id).join(',')) this.placeAll();
    for (const r of s.racers) if (r.place === 1 && !this._celebrated) { this._celebrated = true; this.member(r.id)?.av.jump(); }
    if (s.phase !== 'racing') this._celebrated = s.phase === 'over' ? this._celebrated : false;
  }
  setLocalProgress(id, n) { this.local.set(id, n); }

  onUpdate(dt) {
    const s = this.state;
    if (!s?.text) return;
    const len = fold(s.text).length || 1;
    s.racers.forEach((r, i) => {
      const m = this.members.get(r.id);
      if (!m || i >= LANES) return;
      const prog = Math.max(r.progress, this.local.get(r.id) || 0);
      const tx = START_X + (prog / len) * LEN;
      const p = m.av.root.position;
      const dx = tx - p.x;
      p.x += dx * Math.min(1, dt * 4);
      p.z = laneZ(i);
      m.av.moving = dx > 0.03;
      m.av.faceTo(r.finishedMs ? 0 : Math.PI / 2);
    });
  }
}
