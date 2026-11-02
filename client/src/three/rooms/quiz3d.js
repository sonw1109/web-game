// ❓ Sân khấu Quiz 3D: màn LED hiện câu hỏi, bục tên + điểm cho từng người, đèn sân khấu quét.
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomView } from '../roomView.js';
import { roomShell, mat, textCanvas } from '../props.js';
import { store } from '../../store.js';

const MAX_PODIUMS = 8;
const ANSWER_COLORS = ['#e03e52', '#1c7ed6', '#e8a10d', '#2f9e44'];

function wrap(c, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.forEach((l, i) => c.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
}

export class QuizView extends RoomView {
  constructor(engine) {
    super(engine, 'quiz');
    this.camPos.set(0, 3.1, 9.2);
    this.camLook.set(0, 2.3, -1);
    this.state = null;
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#0d0a1f');
    s.fog = new THREE.Fog('#0d0a1f', 14, 30);
    s.add(roomShell({ w: 18, d: 14, h: 8, floor: '#2b2140', wall: '#221a3d' }));
    s.add(new THREE.HemisphereLight('#c9b8ff', '#1a1030', 0.7));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(2, 8, 8); key.castShadow = true; key.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 }); key.shadow.normalBias = 0.03;
    s.add(key);

    // Sân khấu tròn
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.4, 64, 1, false, Math.PI, Math.PI), mat('#3a2c5a', { roughness: 0.4, metalness: 0.2 }));
    stage.rotation.y = Math.PI; stage.position.set(0, 0.2, -2.5); stage.receiveShadow = true;
    s.add(stage);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(7.65, 0.04, 8, 96, Math.PI), new THREE.MeshStandardMaterial({ color: '#b48cff', emissive: '#9b6bff', emissiveIntensity: 2 }));
    edge.rotation.x = Math.PI / 2; edge.position.set(0, 0.41, -2.5);
    s.add(edge);

    // Màn LED
    this.screen = textCanvas(1600, 800, (c, w, h, st) => this.drawScreen(c, w, h, st));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false }));
    scr.position.set(0, 4.3, -6.6);
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(9.4, 4.9, 0.25, 3, 0.1), mat('#0c0c14', { roughness: 0.3 }));
    bezel.position.set(0, 4.3, -6.78);
    s.add(bezel, scr);
    this.screenGlow = new THREE.PointLight('#8f7bff', 10, 12, 1.5);
    this.screenGlow.position.set(0, 4.3, -5.5);
    s.add(this.screenGlow);
    this.screen.redraw(null);

    // Đèn sân khấu quét
    this.spots = ['#ff4fd8', '#4fd2ff', '#ffe14f'].slice(0, Q.extraLights ? 3 : Q.shadows ? 2 : 1).map((c, i) => {
      const sp = new THREE.SpotLight(c, 40, 22, 0.32, 0.6, 1);
      sp.position.set(-6 + i * 6, 7.5, 3);
      s.add(sp, sp.target);
      return sp;
    });

    // Bục cho từng người
    this.podiums = [];
    for (let i = 0; i < MAX_PODIUMS; i++) {
      const x = (i - (MAX_PODIUMS - 1) / 2) * 1.75;
      const g = new THREE.Group();
      g.position.set(x, 0.4, -1.6 + Math.abs(x) * 0.12);
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.6, 0.8, 3, 0.08), mat('#2c2346', { roughness: 0.4, metalness: 0.3 }));
      body.position.y = 0.3; body.castShadow = body.receiveShadow = true;
      const top = new THREE.Mesh(new RoundedBoxGeometry(1.35, 0.08, 0.9, 2, 0.03), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#7a5cff', emissiveIntensity: 0.6 }));
      top.position.y = 0.63;
      const plate = textCanvas(512, 256, (c, w, h, p) => {
        c.fillStyle = '#120d24'; c.fillRect(0, 0, w, h);
        if (!p) return;
        c.fillStyle = '#ffd2b8'; c.font = 'bold 54px Outfit, sans-serif'; c.textAlign = 'center';
        c.fillText(p.name.slice(0, 14), w / 2, 95);
        c.fillStyle = '#ffffff'; c.font = 'bold 84px Outfit, sans-serif';
        c.fillText(String(p.score), w / 2, 200);
        if (p.last) { c.fillStyle = '#3ddc97'; c.font = 'bold 40px Outfit'; c.textAlign = 'right'; c.fillText(`+${p.last}`, w - 18, 48); }
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: plate.tex, toneMapped: false }));
      face.position.set(0, 0.32, 0.405);
      g.add(body, top, face);
      g.visible = false;
      s.add(g);
      this.podiums.push({ g, top, plate, x: g.position.x, z: g.position.z });
      this.seats.push({ x: g.position.x, z: g.position.z - 0.85, y: 0.4, rot: 0, sit: false });
    }

    // Pháo giấy
    const confGeo = new THREE.PlaneGeometry(0.08, 0.14);
    this.confetti = new THREE.Group();
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6), side: THREE.DoubleSide }));
      m.userData = { x: (Math.random() - 0.5) * 14, z: -4 + Math.random() * 8, sp: 0.6 + Math.random(), ph: Math.random() * 10 };
      this.confetti.add(m);
    }
    this.confetti.visible = false;
    s.add(this.confetti);
    cheapen(s);
  }

  drawScreen(c, w, h, st) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1b1046'); g.addColorStop(1, '#3a0f4a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!st || st.phase === 'idle') {
      c.fillStyle = '#ffd2b8'; c.font = 'bold 150px "Pixelify Sans", Outfit, sans-serif'; c.fillText('ĐỐ VUI', w / 2, h / 2 - 60);
      c.fillStyle = '#c9b8ff'; c.font = '56px Outfit, sans-serif'; c.fillText('HỘI QUÁN', w / 2, h / 2 + 80);
      return;
    }
    if (st.phase === 'countdown') { c.fillStyle = '#ffd2b8'; c.font = 'bold 120px Outfit'; c.fillText('Chuẩn bị…', w / 2, h / 2); return; }
    if (st.phase === 'over') {
      const top = st.board[0];
      c.fillStyle = '#ffd166'; c.font = 'bold 110px Outfit'; c.fillText('🏆 VÔ ĐỊCH', w / 2, h / 2 - 90);
      c.fillStyle = '#fff'; c.font = 'bold 90px Outfit'; c.fillText(top ? `${top.name} – ${top.score}` : '', w / 2, h / 2 + 60);
      return;
    }
    const q = st.question;
    c.fillStyle = '#c9b8ff'; c.font = 'bold 44px Outfit'; c.fillText(`CÂU ${st.index + 1}/${st.total}`, w / 2, 70);
    c.fillStyle = '#fff'; c.font = 'bold 66px Outfit, sans-serif';
    wrap(c, q.q, w / 2, 260, w - 160, 82);
    q.a.forEach((a, i) => {
      const x = 60 + (i % 2) * (w / 2 - 30), y = 450 + Math.floor(i / 2) * 150;
      const correct = st.phase === 'reveal' && st.correct === i;
      c.globalAlpha = st.phase === 'reveal' && !correct ? 0.3 : 1;
      c.fillStyle = ANSWER_COLORS[i];
      c.beginPath(); c.roundRect(x, y, w / 2 - 90, 120, 22); c.fill();
      if (correct) { c.strokeStyle = '#fff'; c.lineWidth = 10; c.stroke(); }
      c.fillStyle = '#fff'; c.font = 'bold 48px Outfit'; c.textAlign = 'left';
      c.fillText(`${'ABCD'[i]}  ${a}`.slice(0, 34), x + 30, y + 62);
      c.textAlign = 'center';
      c.globalAlpha = 1;
    });
  }

  setState(st) {
    const prev = this.state;
    this.state = st;
    if (!prev || prev.phase !== st.phase || prev.index !== st.index) this.screen.redraw(st);
    this.placeAll();
    // bảng tên trên bục
    const byId = new Map(st.board.map((b) => [b.id, b]));
    for (const [id, m] of this.members) {
      const pd = this.podiums[m.seat];
      if (!pd) continue;
      const p = byId.get(id) || { name: store.players.get(id)?.name ?? '?', score: 0, last: 0 };
      pd.plate.redraw({ ...p, last: st.phase === 'reveal' ? p.last : 0 });
      let color = '#7a5cff';
      if (st.phase === 'reveal' && st.reveal) color = st.reveal[id] === undefined ? '#555' : st.reveal[id] === st.correct ? '#2bd97c' : '#ff4757';
      else if (st.phase === 'question' && st.answeredIds.includes(id)) color = '#ffd166';
      pd.top.material.emissive.set(color);
      if (st.phase === 'reveal' && prev?.phase === 'question' && st.reveal[id] === st.correct) m.av.jump();
    }
    this.confetti.visible = st.phase === 'over';
    if (st.phase === 'over' && prev?.phase !== 'over') { const w = this.member(st.board[0]?.id); w?.av.jump(); }
  }

  placeAll() {
    super.placeAll();
    for (let i = 0; i < this.podiums.length; i++) this.podiums[i].g.visible = [...this.members.values()].some((m) => m.seat === i);
  }

  // Xếp bục từ giữa ra 2 bên
  seatFor(id, taken) {
    const order = [3, 4, 2, 5, 1, 6, 0, 7];
    if (id === store.selfId && !taken.has(order[0])) return order[0];
    for (const i of order) if (!taken.has(i)) return i;
    return -1;
  }

  onUpdate(dt, t) {
    this.spots.forEach((sp, i) => sp.target.position.set(Math.sin(t * 0.7 + i * 2) * 6, 0, -1 + Math.cos(t * 0.5 + i) * 2));
    this.screenGlow.intensity = 8 + Math.sin(t * 2) * 2;
    if (this.confetti.visible) {
      for (const m of this.confetti.children) {
        const u = m.userData;
        m.position.set(u.x + Math.sin(t * 2 + u.ph) * 0.4, 7 - ((t * u.sp + u.ph) % 7), u.z);
        m.rotation.set(t * 3 + u.ph, t * 2 + u.ph, 0);
      }
    }
    if (this.state?.phase === 'question') {
      // nhấp nháy viền màn hình khi gần hết giờ – vẽ lại 4 lần/giây là đủ
      if (!this._tick || t - this._tick > 0.25) { this._tick = t; }
    }
  }
}
