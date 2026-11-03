// ⭕ Quán Caro 3D: bàn trà thấp, bàn cờ gỗ 15×15, quân cờ 3D, click thẳng lên bàn.
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomView } from '../roomView.js';
import { roomShell, cushion, candle, flicker, tree, mat, textCanvas, CUSHION_SEAT_Y } from '../props.js';
import { store } from '../../store.js';

const N = 15, BOARD = 3.3, CELL = BOARD / N, TABLE_Y = 0.62;

export class CaroView extends RoomView {
  constructor(engine) {
    super(engine, 'caro');
    this.camPos.set(0, 6.4, 5.4);
    this.camLook.set(0, 0.2, 0.15);
    this.parallax = 0.2;
    this.pieces = new Map(); // ô → mesh
    this.state = null;
    this.onCell = null;
    this.build();
  }

  build() {
    const s = this.scene;
    s.background = new THREE.Color('#1f140d');
    s.fog = new THREE.Fog('#1f140d', 12, 26);
    s.add(roomShell({ w: 14, d: 14, h: 6, floor: '#6a4428', wall: '#7a4a2e' }));
    s.add(new THREE.HemisphereLight('#ffe3c0', '#5a3a24', 1.7));
    const lantern = new THREE.PointLight('#ffc27a', 30, 12, 1.6);
    lantern.position.set(0, 3.4, 0); lantern.castShadow = Q.extraLights; // bóng đèn điểm = 6 lần vẽ → chỉ bật ở mức cao
    lantern.shadow.mapSize.setScalar(Math.min(1024, Q.shadowSize)); lantern.shadow.normalBias = 0.02;
    s.add(lantern);
    const lampMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.6, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: '#ffb060', emissiveIntensity: 1.4, side: THREE.DoubleSide }));
    lampMesh.position.set(0, 3.7, 0);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.5), mat('#222'));
    cord.position.set(0, 5.2, 0);
    s.add(lampMesh, cord);
    this.hanging = [lampMesh, cord]; // ẩn khi nhìn thẳng từ trên xuống (nếu không sẽ che bàn cờ)

    // Bàn trà thấp
    const table = new THREE.Mesh(new RoundedBoxGeometry(BOARD + 0.9, 0.16, BOARD + 0.9, 3, 0.06), mat('#4a2c18', { roughness: 0.5 }));
    table.position.y = TABLE_Y - 0.08; table.castShadow = table.receiveShadow = true;
    s.add(table);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, TABLE_Y - 0.16, 0.16), mat('#3a2212'));
      leg.position.set(x * (BOARD / 2 + 0.2), (TABLE_Y - 0.16) / 2, z * (BOARD / 2 + 0.2));
      leg.castShadow = true; s.add(leg);
    }
    // Mặt bàn cờ
    const boardTex = textCanvas(1024, 1024, (c, w) => {
      const g = c.createLinearGradient(0, 0, w, w);
      g.addColorStop(0, '#e9c98f'); g.addColorStop(1, '#d6ad6b');
      c.fillStyle = g; c.fillRect(0, 0, w, w);
      for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(120,70,20,${Math.random() * 0.08})`; c.beginPath(); const y = Math.random() * w; c.moveTo(0, y); c.bezierCurveTo(w / 3, y + 10, w * 0.66, y - 10, w, y); c.stroke(); }
      c.strokeStyle = 'rgba(80,45,15,.8)'; c.lineWidth = 2.5;
      const step = w / N;
      for (let i = 0; i <= N; i++) {
        c.beginPath(); c.moveTo(i * step, 0); c.lineTo(i * step, w); c.stroke();
        c.beginPath(); c.moveTo(0, i * step); c.lineTo(w, i * step); c.stroke();
      }
      c.lineWidth = 10; c.strokeRect(0, 0, w, w);
    });
    boardTex.redraw();
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ map: boardTex.tex, roughness: 0.55 }));
    this.board.rotation.x = -Math.PI / 2; this.board.position.y = TABLE_Y + 0.002; this.board.receiveShadow = true;
    s.add(this.board);

    // Quân mẫu
    this.xGeo = (() => {
      const a = new RoundedBoxGeometry(CELL * 0.86, 0.06, CELL * 0.2, 2, 0.02);
      return a;
    })();
    this.oGeo = new THREE.TorusGeometry(CELL * 0.3, CELL * 0.085, 10, 24);
    this.xMat = new THREE.MeshStandardMaterial({ color: '#d63031', roughness: 0.35, metalness: 0.1 });
    this.oMat = new THREE.MeshStandardMaterial({ color: '#1e7fd8', roughness: 0.35, metalness: 0.1 });
    this.winMat = { X: this.xMat.clone(), O: this.oMat.clone() };
    for (const k of ['X', 'O']) { this.winMat[k].emissive = new THREE.Color(k === 'X' ? '#ff4040' : '#3aa0ff'); }
    this.ghost = this.makePiece('X', true);
    this.ghost.visible = false;
    s.add(this.ghost);
    this.lastRing = new THREE.Mesh(new THREE.RingGeometry(CELL * 0.4, CELL * 0.48, 24), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9 }));
    this.lastRing.rotation.x = -Math.PI / 2; this.lastRing.visible = false;
    s.add(this.lastRing);

    // Chỗ ngồi: 0 = ghế ✕ (phía camera), 1 = ghế ◯ (đối diện), còn lại khán giả
    const R = BOARD / 2 + 1.05;
    this.seats.push({ x: 0, z: R, y: CUSHION_SEAT_Y - 0.05, rot: Math.PI, sit: true });
    this.seats.push({ x: 0, z: -R, y: CUSHION_SEAT_Y - 0.05, rot: 0, sit: true });
    for (const [x, z] of [[-R - 0.3, -1], [R + 0.3, -1], [-R - 0.3, 1], [R + 0.3, 1], [-2.2, -R - 1.2], [2.2, -R - 1.2], [-4.2, 0], [4.2, 0]]) {
      this.seats.push({ x, z, y: CUSHION_SEAT_Y - 0.05, rot: Math.atan2(-x, -z), sit: true });
    }
    for (const st of this.seats) { const c = cushion({ withMat: true }); c.position.set(st.x, 0, st.z); c.rotation.y = st.rot; s.add(c); }

    // Trang trí: cây cảnh, nến, ấm trà
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 5.5], [6, 5.5]]) { const t = tree(Math.random, 0.9); t.position.set(x, 0, z); s.add(t); }
    this.candles = [];
    for (const [x, z] of [[-BOARD / 2 - 0.25, -BOARD / 2 - 0.25], [BOARD / 2 + 0.25, BOARD / 2 + 0.25]]) {
      const c = candle(0.25); c.position.set(x, TABLE_Y, z); s.add(c); this.candles.push(c);
    }
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), mat('#5d7a5a', { roughness: 0.3 }));
    pot.scale.y = 0.8; pot.position.set(BOARD / 2 + 0.25, TABLE_Y + 0.12, -BOARD / 2 - 0.2); pot.castShadow = true;
    s.add(pot);

    // Input: chuột = click đặt quân; cảm ứng = chạm 2 lần (lần 1 xem trước, lần 2 đặt);
    // chế độ phóng to: chụm 2 ngón để zoom, kéo 1 ngón để di chuyển bàn cờ
    this.focus = false; this.zoom = 1; this.pan = new THREE.Vector2(); this.pending = -1;
    this.focusCam = new THREE.Vector3();
    const cv = this.engine.canvas;
    const pts = new Map();
    let drag = null, pinch = 0;
    this._pd = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false };
      else { drag = null; pinch = this.pinchDist(pts); }
    };
    this._pm = (e) => {
      if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') this.hover(e); return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && this.focus) {
        const d = this.pinchDist(pts);
        this.zoom = THREE.MathUtils.clamp(this.zoom * (d / pinch), 1, 3); pinch = d;
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.moved = true;
      if (drag.moved && this.focus && this.zoom > 1.05) {
        const k = this.worldPerPx();
        this.pan.x -= (e.clientX - drag.x) * k; this.pan.y -= (e.clientY - drag.y) * k;
        const lim = (BOARD / 2) * (1 - 1 / this.zoom);
        this.pan.x = THREE.MathUtils.clamp(this.pan.x, -lim, lim); this.pan.y = THREE.MathUtils.clamp(this.pan.y, -lim, lim);
      }
      drag.x = e.clientX; drag.y = e.clientY;
      if (e.pointerType === 'mouse') this.hover(e);
    };
    this._pu = (e) => {
      const wasTap = drag && !drag.moved && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size === 0) drag = null;
      if (!wasTap) return;
      const i = this.cellAt(e.clientX, e.clientY);
      if (i < 0) { this.pending = -1; this.showGhost(-1); return; }
      if (e.pointerType === 'mouse' || this.pending === i) { this.pending = -1; this.onCell?.(i); }
      else if (this.canPlay(i)) { this.pending = i; this.showGhost(i); } // chạm lần 1: xem trước
    };
    cheapen(s);
    this.onActivate = () => { for (const [ev, fn] of [['pointermove', this._pm], ['pointerdown', this._pd], ['pointerup', this._pu], ['pointercancel', this._pu]]) cv.addEventListener(ev, fn); };
    this.onDeactivate = () => {
      for (const [ev, fn] of [['pointermove', this._pm], ['pointerdown', this._pd], ['pointerup', this._pu], ['pointercancel', this._pu]]) cv.removeEventListener(ev, fn);
      this.ghost.visible = false; pts.clear(); this.setFocus(false);
    };
  }

  pinchDist(pts) { const [a, b] = [...pts.values()]; return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); }
  /** Chiều cao camera (nhìn thẳng xuống) để cả bàn cờ vừa màn hình, chia theo mức zoom. */
  focusHeight() {
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    return ((BOARD / 2 + 0.25) / this.zoom) / (tanH * Math.min(1, this.camera.aspect));
  }
  worldPerPx() { return (2 * this.focusHeight() * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.engine.size.h; }
  setFocus(v) {
    this.focus = v; this.zoom = 1; this.pan.set(0, 0);
    for (const o of this.hanging) o.visible = !v;
    this.camera.up.set(0, 1, 0);
    this.onFocusChange?.(v);
  }
  canPlay(i) { const s = this.state, me = this.mySeat(); return !!(s && s.status === 'playing' && s.turn === me && !s.board[i]); }
  showGhost(i) {
    const me = this.mySeat();
    if (i < 0 || !me) { this.ghost.visible = false; return; }
    if (this.ghost.userData.seat !== me) {
      this.scene.remove(this.ghost);
      this.ghost = this.makePiece(me, true); this.ghost.userData.seat = me;
      this.scene.add(this.ghost);
    }
    const [x, z] = this.cellPos(i);
    this.ghost.position.set(x, TABLE_Y + 0.05, z);
    this.ghost.visible = true;
  }

  /** Vật liệu quân "bóng mờ" (tạo 1 lần cho mỗi bên rồi dùng lại – trước đây nhân bản mỗi lần đổi ghế mà không giải phóng). */
  ghostMat(side) {
    this._ghostMats ||= {};
    if (!this._ghostMats[side]) { const m = (side === 'X' ? this.xMat : this.oMat).clone(); m.transparent = true; m.opacity = 0.4; this._ghostMats[side] = m; }
    return this._ghostMats[side];
  }

  makePiece(seat, ghost = false) {
    let m;
    if (seat === 'X') {
      m = new THREE.Group();
      for (const r of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(this.xGeo, ghost ? this.ghostMat('X') : this.xMat);
        bar.rotation.y = r; bar.castShadow = true; m.add(bar);
      }
    } else {
      m = new THREE.Mesh(this.oGeo, ghost ? this.ghostMat('O') : this.oMat);
      m.rotation.x = -Math.PI / 2; m.castShadow = true;
    }
    return m;
  }

  cellPos(i) { return [(i % N + 0.5) * CELL - BOARD / 2, (Math.floor(i / N) + 0.5) * CELL - BOARD / 2]; }

  cellAt(cx, cy) {
    const hit = this.engine.pick(cx, cy, [this.board], false)[0];
    if (!hit) return -1;
    const gx = Math.floor((hit.point.x + BOARD / 2) / CELL), gz = Math.floor((hit.point.z + BOARD / 2) / CELL);
    return gx >= 0 && gz >= 0 && gx < N && gz < N ? gz * N + gx : -1;
  }

  mySeat() { const s = this.state; return s?.seats.X?.id === store.selfId ? 'X' : s?.seats.O?.id === store.selfId ? 'O' : null; }

  hover(e) {
    const s = this.state, me = this.mySeat();
    const i = s && s.status === 'playing' && s.turn === me ? this.cellAt(e.clientX, e.clientY) : -1;
    if (i < 0 || s.board[i]) { this.ghost.visible = false; this.engine.canvas.style.cursor = ''; return; }
    if (this.ghost.userData.seat !== me) {
      this.scene.remove(this.ghost);
      this.ghost = this.makePiece(me, true); this.ghost.userData.seat = me;
      this.scene.add(this.ghost);
    }
    const [x, z] = this.cellPos(i);
    this.ghost.position.set(x, TABLE_Y + 0.05, z);
    this.ghost.visible = true;
    this.engine.canvas.style.cursor = 'pointer';
  }

  /** Vai trò: ✕ ngồi chỗ 0, ◯ ngồi chỗ 1, người khác làm khán giả. */
  seatFor(id, taken) {
    const s = this.state;
    if (s?.seats.X?.id === id) return 0;
    if (s?.seats.O?.id === id) return 1;
    for (let i = 2; i < this.seats.length; i++) if (!taken.has(i)) return i;
    return -1;
  }

  setState(s) {
    const prevRoles = `${this.state?.seats.X?.id}|${this.state?.seats.O?.id}`;
    this.state = s;
    if (this.pending >= 0 && !this.canPlay(this.pending)) { this.pending = -1; this.showGhost(-1); }
    if (prevRoles !== `${s.seats.X?.id}|${s.seats.O?.id}`) this.placeAll();
    // đồng bộ quân cờ
    s.board.forEach((v, i) => {
      const cur = this.pieces.get(i);
      if (cur && cur.userData.v === v) return;
      if (cur) { this.scene.remove(cur); this.pieces.delete(i); }
      if (!v) return;
      const p = this.makePiece(v);
      p.userData.v = v; p.userData.born = performance.now();
      const [x, z] = this.cellPos(i);
      p.position.set(x, TABLE_Y + 0.05, z);
      this.scene.add(p);
      this.pieces.set(i, p);
    });
    const win = new Set(s.winLine);
    for (const [i, p] of this.pieces) {
      const m = win.has(i) ? this.winMat[p.userData.v] : p.userData.v === 'X' ? this.xMat : this.oMat;
      p.traverse((o) => { if (o.isMesh) o.material = m; });
    }
    if (s.lastMove >= 0) { const [x, z] = this.cellPos(s.lastMove); this.lastRing.position.set(x, TABLE_Y + 0.006, z); this.lastRing.visible = true; }
    else this.lastRing.visible = false;
    // người thắng nhảy mừng
    if (s.status === 'over' && s.winner && s.winner !== 'draw' && this._celebrated !== s.lastMove) {
      this._celebrated = s.lastMove;
      this.member(s.seats[s.winner]?.id)?.av.jump();
    }
  }

  onUpdate(dt, t) {
    if (this.focus) {
      // nhìn thẳng xuống bàn cờ; camera.up hướng −z để hàng trên của bàn nằm trên màn hình
      const want = new THREE.Vector3(this.pan.x, TABLE_Y + this.focusHeight(), this.pan.y + 0.001);
      this.focusCam.lerp(want, Math.min(1, dt * 8));
      this.camera.position.copy(this.focusCam);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(this.focusCam.x, TABLE_Y, this.focusCam.z - 0.001);
    } else this.focusCam.copy(this.camera.position);
    const now = performance.now();
    for (const p of this.pieces.values()) { // quân mới rơi xuống bàn
      const a = Math.min(1, (now - p.userData.born) / 250);
      p.position.y = TABLE_Y + 0.05 + (1 - a) * 0.5;
    }
    const pulse = 0.6 + Math.sin(t * 6) * 0.4;
    this.winMat.X.emissiveIntensity = pulse; this.winMat.O.emissiveIntensity = pulse;
    this.lastRing.material.opacity = 0.5 + Math.sin(t * 4) * 0.35;
    this.candles.forEach((c, i) => flicker(c, t, i));
  }
}
