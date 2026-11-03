// 🕹️ Cảnh 3D dùng chung cho mọi phòng trong Khu Trò Chơi: gian phòng ấm cúng, bàn gỗ ở giữa.
// Mặt bàn là 1 canvas – mỗi game tự vẽ bàn cờ / bảng chơi lên đó (view.drawTable) nên rất nhẹ:
// chỉ vẽ lại khi trạng thái đổi, không thêm mesh nào.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoomView } from '../roomView.js';
import { roomShell, mat, textCanvas, tree } from '../props.js';
import { store } from '../../store.js';
import { gameById } from '../../game/arcade.js';

const TABLE = 2.6, TABLE_Y = 0.78;

export class ArcadeView extends RoomView {
  constructor(engine, roomId) {
    super(engine, roomId);
    this.game = gameById(roomId) || { name: roomId, icon: '🎮', color: '#7a4b2a' };
    this.camPos.set(0, 5.6, 5.8);
    this.camLook.set(0, 0.6, 0);
    this.parallax = 0.22;
    /** Ai ngồi vào bàn (theo thứ tự) – game đặt qua setPlayers; còn lại đứng xem. */
    this.players = [];
    this.build();
  }

  build() {
    const s = this.scene, color = this.game.color;
    s.background = new THREE.Color('#1d1410');
    s.fog = new THREE.Fog('#1d1410', 13, 28);
    s.add(roomShell({ w: 14, d: 13, h: 6, floor: '#5e3c24', wall: shade(color, 0.55) }));
    s.add(new THREE.HemisphereLight('#ffe9cc', '#4a3020', 1.75));
    const key = new THREE.DirectionalLight('#fff1d8', 1.6);
    key.position.set(-3, 8, 5); key.castShadow = Q.shadows;
    key.shadow.mapSize.setScalar(Math.min(1024, Q.shadowSize));
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); key.shadow.normalBias = 0.03;
    s.add(key);
    if (Q.extraLights) { const glow = new THREE.PointLight(color, 12, 9, 1.8); glow.position.set(0, 3.2, 0); s.add(glow); }

    // Thảm tròn màu của game
    const rug = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), mat(color, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.006; rug.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.RingGeometry(4.0, 4.2, 48), mat('#f2d39a', { roughness: 1 }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.008;
    s.add(rug, rim);

    // Bàn gỗ + mặt bàn canvas
    const top = new THREE.Mesh(new RoundedBoxGeometry(TABLE + 0.5, 0.14, TABLE + 0.5, 3, 0.05), mat('#4a2c18', { roughness: 0.5 }));
    top.position.y = TABLE_Y - 0.07; top.castShadow = top.receiveShadow = true;
    s.add(top);
    const legMat = mat('#33200f');
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, TABLE_Y - 0.14, 0.14), legMat);
      leg.position.set(x * (TABLE / 2 + 0.05), (TABLE_Y - 0.14) / 2, z * (TABLE / 2 + 0.05)); leg.castShadow = true;
      s.add(leg);
    }
    this.face = textCanvas(768, 768, (c, w, h, draw) => {
      c.fillStyle = '#2a1a10'; c.fillRect(0, 0, w, h);
      if (draw) { try { draw(c, w, h); } catch (e) { console.warn('[arcade] drawTable', e); } }
      else this.drawLogo(c, w, h);
    });
    this.face.redraw();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(TABLE, TABLE), new THREE.MeshStandardMaterial({ map: this.face.tex, roughness: 0.6 }));
    face.rotation.x = -Math.PI / 2; face.position.y = TABLE_Y + 0.003; face.receiveShadow = true;
    s.add(face);

    // Ghế đẩu quanh bàn: 0 = phía camera (người chơi 1), 1 = đối diện, 2–5 hai bên
    const stoolGeo = new THREE.CylinderGeometry(0.26, 0.22, 0.46, 16);
    const stoolMat = mat('#8a5a34', { roughness: 0.7 });
    const R = TABLE / 2 + 0.55;
    const spots = [[0, R, Math.PI], [0, -R, 0], [-R, 0.6, Math.PI / 2], [R, 0.6, -Math.PI / 2], [-R, -0.6, Math.PI / 2], [R, -0.6, -Math.PI / 2]];
    for (const [x, z, rot] of spots) {
      const st = new THREE.Mesh(stoolGeo, stoolMat);
      st.position.set(x * 1.08, 0.23, z * 1.08); st.castShadow = st.receiveShadow = true;
      s.add(st);
      this.seats.push({ x: x * 1.08, z: z * 1.08, y: 0.46 - 0.4, rot, sit: true });
    }
    // Chỗ đứng xem phía sau
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * (0.15 + (k / 11) * 0.7) + Math.PI, r = 4.6 + (k % 2) * 0.7;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.seats.push({ x, z, rot: Math.atan2(-x, -z), sit: false });
    }

    // Bảng hiệu phát sáng trên tường sau
    const sign = textCanvas(1024, 220, (c, w, h) => {
      c.fillStyle = '#1a0f0a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = color; c.lineWidth = 14; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#fff4dc'; c.font = 'bold 110px "Baloo 2", Outfit, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = color; c.shadowBlur = 30;
      c.fillText(`${this.game.icon} ${this.game.name}`, w / 2, h / 2 + 6);
    });
    sign.redraw();
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.16), new THREE.MeshBasicMaterial({ map: sign.tex }));
    board.position.set(0, 3.9, -6.45);
    s.add(board);

    // Đồ trang trí: kệ, chậu cây, đèn lồng
    const shelfMat = mat('#4a2c18');
    for (const x of [-4.6, 4.6]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 0.5), shelfMat);
      shelf.position.set(x, 1.1, -6.2); shelf.castShadow = true; s.add(shelf);
      for (let i = 0; i < 6; i++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.3), mat(['#d35400', '#2f80c9', '#27ae60', '#8e44ad', '#f1c40f', '#c0392b'][i]));
        box.position.set(x - 0.7 + (i % 3) * 0.7, 0.55 + Math.floor(i / 3) * 0.9, -6.05); s.add(box);
      }
    }
    for (const [x, z] of [[-6.2, 4.5], [6.2, 4.5], [-6.2, -5.4], [6.2, -5.4]]) {
      const t = tree(Math.random, 0.45); t.position.set(x, 0, z); s.add(t);
    }
    const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ff9a3a', emissiveIntensity: 1.2 });
    for (const x of [-3, 3]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), lanternMat);
      l.scale.y = 1.25; l.position.set(x, 4.4, -1); s.add(l);
    }
    cheapen(s);
  }

  drawLogo(c, w, h) {
    c.fillStyle = shade(this.game.color, 0.8); c.fillRect(24, 24, w - 48, h - 48);
    c.font = `${Math.round(w * 0.32)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(this.game.icon, w / 2, h / 2);
  }

  /** Game vẽ lên mặt bàn: fn(ctx, w, h). Gọi khi trạng thái đổi (không gọi mỗi khung hình). */
  drawTable(fn) { this.face.redraw(fn); }

  /** Danh sách id được ngồi vào bàn theo thứ tự (vd. [trắng, đen]). */
  setPlayers(ids) {
    const next = (Array.isArray(ids) ? ids : []).slice(0, 6).map((x) => x || null); // giữ chỗ trống (vd. chỉ có bên đen)
    if (next.join() === this.players.join()) return;
    this.players = next;
    this.placeAll();
  }

  seatFor(id, taken) {
    const i = this.players.indexOf(id);
    if (i >= 0) return i;
    // chưa ai ngồi bàn: mình ngồi ghế gần camera cho dễ nhìn
    if (!this.players.some(Boolean) && id === store.selfId && !taken.has(0)) return 0;
    for (let k = 6; k < this.seats.length; k++) if (!taken.has(k)) return k;
    return -1;
  }
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}
