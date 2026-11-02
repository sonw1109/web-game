// 🏮 Sảnh 3D: khu phố Hội Quán. 1 ô của bản đồ cũ = 1 mét. Server vẫn dùng đơn vị px (×16).
import * as THREE from 'three';
import { Q } from './quality.js';
import { cheapen } from './engine.js';
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { Avatar } from './avatar.js';
import { Controller } from './controller.js';
import { OrbitRig } from './orbit.js';
import { Labels } from '../ui/labels.js';
import { mat, textures, tree, lamp, bench, house, fountain } from './props.js';
import { MAP_W, MAP_H, BUILDINGS, SPAWN, FOUNTAIN, POND, GROUND, treePositions } from '../game/map.js';

const PX = 16;                 // 1 mét = 16 px phía server
const SEND_MS = 66;
const DOOR_RANGE = 1.3;

/** Mặt đất vẽ từ lưới GROUND (cỏ, đường đá, quảng trường). */
function groundTexture() {
  const S = Q.groundRes;
  const cv = document.createElement('canvas');
  cv.width = MAP_W * S; cv.height = MAP_H * S;
  const c = cv.getContext('2d');
  let seed = 11; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // cỏ
  c.fillStyle = '#6fae55'; c.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 40000; i++) {
    c.fillStyle = `hsla(${92 + r() * 30}, ${40 + r() * 25}%, ${33 + r() * 22}%, .55)`;
    c.fillRect(r() * cv.width, r() * cv.height, 2, 3 + r() * 4);
  }
  for (let i = 0; i < 500; i++) { // hoa dại
    c.fillStyle = ['#fff5b0', '#ffb3c7', '#ffffff', '#c7e3ff'][i % 4];
    c.beginPath(); c.arc(r() * cv.width, r() * cv.height, 2.2, 0, 7); c.fill();
  }
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const t = GROUND[ty][tx], x = tx * S, y = ty * S;
    if (t === 1) { // đường lát đá
      c.fillStyle = '#cdb994'; c.fillRect(x, y, S, S);
      c.strokeStyle = 'rgba(110,90,60,.45)'; c.lineWidth = 2;
      const off = ty % 2 ? S / 2 : 0;
      c.strokeRect(x - off, y + 1, S, S / 2 - 1); c.strokeRect(x + S - off, y + 1, S, S / 2 - 1);
      c.strokeRect(x, y + S / 2, S, S / 2);
      for (let k = 0; k < 6; k++) { c.fillStyle = `rgba(255,255,255,${r() * 0.12})`; c.fillRect(x + r() * S, y + r() * S, 4, 3); }
    } else if (t === 2) { // quảng trường
      c.fillStyle = (tx + ty) % 2 ? '#e3d3b6' : '#d6c3a2'; c.fillRect(x, y, S, S);
      c.strokeStyle = 'rgba(120,100,70,.3)'; c.lineWidth = 1.5; c.strokeRect(x + 1, y + 1, S - 2, S - 2);
    } else if (t === 3) {
      c.fillStyle = '#3a6f8f'; c.fillRect(x, y, S, S);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function skyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5d7fc4'); g.addColorStop(0.55, '#f2b07c'); g.addColorStop(1, '#ffd9a8');
  c.fillStyle = g; c.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WorldView {
  constructor(engine, character) {
    this.engine = engine;
    this.character = character;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.rig = new OrbitRig({ dist: 8.5, minDist: 3.5, maxDist: 22, pitch: 0.62, minPitch: 0.15, maxPitch: 1.3, height: 1.0 });
    this.labels = new Labels(document.getElementById('world-labels'));
    this.remotes = new Map();
    this.nearDoor = null;
    this.lastSent = { t: 0, x: 0, z: 0, rot: 0, moving: false };
    this.active = false;

    this.buildWorld();
    this.ctrl = new Controller({ bounds: { x0: 1, z0: 1, x1: MAP_W - 1, z1: MAP_H - 1 }, rects: this.rects, circles: this.circles });
    this.ctrl.onKey = (code) => this.onKey(code);
    this.setCharacter(character);
    this.setupPointer();
    this.setupNetwork();
  }

  // ---------------- Dựng thế giới ----------------
  buildWorld() {
    const s = this.scene;
    s.background = skyTexture();
    s.fog = new THREE.Fog('#f4c38f', 26, 60);
    this.rects = []; this.circles = [];

    // Ánh sáng: chiều tà ấm áp
    s.add(new THREE.HemisphereLight('#ffe9c7', '#5c4a3a', 1.1));
    const sun = (this.sun = new THREE.DirectionalLight('#ffd7a3', 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);

    // Mặt đất
    const far = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: textures.grass([60, 60]), roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(MAP_W / 2, -0.02, MAP_H / 2); far.receiveShadow = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(MAP_W / 2, 0, MAP_H / 2); ground.receiveShadow = true;
    s.add(far, ground);
    this.ground = ground;

    // Hồ nước
    const P = POND;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), new THREE.MeshStandardMaterial({ color: '#3d8fd6', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.position.set(P.x + P.w / 2, 0.03, P.y + P.h / 2);
    s.add(water);
    this.water = water;
    const rimMat = mat('#9c968f');
    for (const [w, d, x, z] of [[P.w + 0.4, 0.2, P.x + P.w / 2, P.y - 0.1], [P.w + 0.4, 0.2, P.x + P.w / 2, P.y + P.h + 0.1], [0.2, P.h, P.x - 0.1, P.y + P.h / 2], [0.2, P.h, P.x + P.w + 0.1, P.y + P.h / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), rimMat);
      m.position.set(x, 0.09, z); m.castShadow = m.receiveShadow = true; s.add(m);
    }
    for (let i = 0; i < 4; i++) { // lá sen
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16, 0.3, Math.PI * 1.8), mat('#4f9a45'));
      pad.rotation.x = -Math.PI / 2; pad.position.set(P.x + 0.8 + i * 1.1, 0.05, P.y + 0.9 + (i % 2) * 1.8); s.add(pad);
    }
    this.rects.push({ x: P.x, z: P.y, w: P.w, d: P.h });

    // Nhà
    this.signs = [];
    for (const b of BUILDINGS) {
      const d = b.h - 1.2, cx = b.doorX, cz = b.y + b.h - 0.35 - d / 2;
      const h = house({ w: b.w - 0.6, d, wall: b.wall, roof: b.roof });
      h.position.set(cx, 0, cz);
      s.add(h);
      this.rects.push({ x: cx - (b.w - 0.6) / 2 - 0.15, z: cz - d / 2 - 0.15, w: b.w - 0.3, d: d + 0.3 });
      b.door3d = { x: cx, z: b.y + b.h + 0.25 };
      (this.doors ||= {})[b.id] = b.door3d;
      this.signs.push({ el: this.labels.addSign(`${b.icon} ${b.name}`), pos: new THREE.Vector3(cx, 4.1, cz + d / 2) });
    }

    // Đài phun nước
    const f = (this.fountain = fountain());
    f.position.set(FOUNTAIN.x / PX, 0, FOUNTAIN.y / PX);
    s.add(f);
    this.circles.push({ x: f.position.x, z: f.position.z, r: 1.45 });

    // Đèn & ghế quanh quảng trường
    for (const [x, z] of [[18.5, 12.5], [29.5, 12.5], [18.5, 21.6], [29.5, 21.6]]) {
      const l = lamp(); l.position.set(x, 0, z); s.add(l);
      this.circles.push({ x, z, r: 0.15 });
    }
    for (const [x, z, ry] of [[20.5, 12.9, 0], [27.5, 12.9, 0], [20.5, 21.2, Math.PI], [27.5, 21.2, Math.PI]]) {
      const b = bench(); b.position.set(x, 0, z); b.rotation.y = ry; s.add(b);
      this.rects.push({ x: x - 0.65, z: z - 0.25, w: 1.3, d: 0.5 });
    }

    // Cây (gộp instanced cho nhẹ)
    this.buildTrees(treePositions());
    cheapen(s);
  }

  buildTrees(list) {
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.9, 7);
    trunkGeo.translate(0, 0.45, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, mat('#6b4226'), list.length);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), list.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let seed = 5; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const greens = ['#3f8f3a', '#4ea446', '#357a35', '#5bb04f', '#6bbf5a'];
    list.forEach(([tx, tz], i) => {
      const k = 0.85 + r() * 0.5;
      m.compose(p.set(tx, 0, tz), q.setFromEuler(new THREE.Euler(0, r() * 6, 0)), sc.set(k, k, k));
      trunks.setMatrixAt(i, m);
      for (let j = 0; j < 3; j++) {
        const s = (0.62 - j * 0.14) * k;
        m.compose(p.set(tx + (r() - 0.5) * 0.2, (1.05 + j * 0.38) * k, tz + (r() - 0.5) * 0.2), q.setFromEuler(new THREE.Euler(r(), r(), r())), sc.set(s, s * 0.9, s));
        leaves.setMatrixAt(i * 3 + j, m);
        leaves.setColorAt(i * 3 + j, col.set(greens[Math.floor(r() * greens.length)]));
      }
      this.circles.push({ x: tx, z: tz, r: 0.3 });
    });
    for (const im of [trunks, leaves]) { im.castShadow = true; im.receiveShadow = true; this.scene.add(im); }
  }

  // ---------------- Nhân vật ----------------
  setCharacter(character) {
    this.character = character;
    this.me?.dispose();
    this.me = new Avatar(character.appearance);
    this.scene.add(this.me.root);
    const start = character.lastPos || SPAWN;
    this.ctrl.pos = { x: start.x / PX, z: start.y / PX };
    if (this.ctrl.blocked(this.ctrl.pos.x, this.ctrl.pos.z)) this.ctrl.pos = { x: SPAWN.x / PX, z: SPAWN.y / PX };
    this.me.setPosition(this.ctrl.pos.x, this.ctrl.pos.z);
    this.labels.add('me', character.name, true);
  }

  addRemote(p) {
    if (this.remotes.has(p.id) || p.id === store.selfId) return;
    const av = new Avatar(p.appearance);
    av.setPosition(p.x / PX, p.y / PX);
    av.root.rotation.y = p.rot || 0;
    av.root.visible = p.room === 'lobby';
    this.scene.add(av.root);
    this.remotes.set(p.id, { av, tx: p.x / PX, tz: p.y / PX, rot: p.rot || 0, moving: false });
    this.labels.add(p.id, p.name, false);
    this.labels.setVisible(p.id, p.room === 'lobby' && this.active);
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.av.dispose();
    this.remotes.delete(id);
    this.labels.remove(id);
  }

  // ---------------- Input ----------------
  onKey(code) {
    if (store.room !== 'lobby') return;
    if (code === 'KeyE' && this.nearDoor) store.emit('enter-room', this.nearDoor.id);
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(code);
    if (digit) socket.emit('emoji:send', +digit[1] - 1);
    if (code === 'Equal' || code === 'NumpadAdd') this.rig.zoom(-1.5);
    if (code === 'Minus' || code === 'NumpadSubtract') this.rig.zoom(1.5);
  }

  // Kéo để xoay camera, chạm/click (không kéo) để đi tới chỗ đó
  setupPointer() {
    this.rig.onTap = (e) => {
      if (!this.active || store.room !== 'lobby') return;
      const hit = this.engine.pick(e.clientX, e.clientY, [this.ground], false)[0];
      if (hit) this.ctrl.goTo(hit.point.x, hit.point.z);
    };
    this.rig.onRotate = () => store.emit('camera-rotated');
  }

  // ---------------- Mạng ----------------
  setupNetwork() {
    const join = () => {
      socket.emit('world:join', {
        name: this.character.name, appearance: this.character.appearance, x: this.ctrl.pos.x * PX, y: this.ctrl.pos.z * PX,
      }, ({ selfId, players }) => {
        store.selfId = selfId;
        store.players.clear();
        for (const id of [...this.remotes.keys()]) this.removeRemote(id);
        for (const p of players) {
          store.players.set(p.id, p);
          if (p.id !== selfId) this.addRemote(p);
        }
        if (store.room !== 'lobby') socket.emit('world:setRoom', store.room);
        store.emit('players-changed');
      });
    };
    const handlers = {
      connect: join,
      'world:playerJoined': (p) => { store.players.set(p.id, p); this.addRemote(p); store.emit('players-changed'); },
      'world:playerLeft': ({ id }) => { store.players.delete(id); this.removeRemote(id); store.emit('players-changed'); },
      'world:roomChanged': ({ id, room }) => {
        const p = store.players.get(id);
        if (p) p.room = room;
        const r = this.remotes.get(id);
        if (r) { r.av.root.visible = room === 'lobby'; this.labels.setVisible(id, room === 'lobby' && this.active); }
        store.emit('players-changed');
      },
      'world:snapshot': (snap) => {
        for (const [id, x, y, dir, moving, rot] of snap) {
          const p = store.players.get(id);
          if (p) Object.assign(p, { x, y, dir, moving: !!moving, rot: rot ?? 0 });
          const r = this.remotes.get(id);
          if (r && p?.room === 'lobby') Object.assign(r, { tx: x / PX, tz: y / PX, moving: !!moving, rot: rot ?? 0 });
        }
        store.emit('snapshot');
      },
    };
    for (const [ev, fn] of Object.entries(handlers)) socket.on(ev, fn);
    if (socket.connected) join();
  }

  // ---------------- Bong bóng chat / emoji (main.js gọi) ----------------
  labelId(id) { return id === store.selfId ? 'me' : id; }
  bubble(id, text) { this.labels.bubble(this.labelId(id), text); }
  emoji(id, e) { this.labels.emoji(this.labelId(id), e); }

  // ---------------- Vòng lặp ----------------
  activate() {
    this.active = true;
    this.labels.root.hidden = false;
    this.labels.setVisible('me', true);
    for (const [id] of this.remotes) this.labels.setVisible(id, store.players.get(id)?.room === 'lobby');
    for (const s of this.signs) s.el.hidden = false;
    this.ctrl.setEnabled(true);
    this.rig.attach(this.engine.canvas);
  }
  deactivate() {
    this.active = false;
    this.ctrl.setEnabled(false);
    this.rig.detach();
    this.labels.root.hidden = true;
  }

  update(dt, t) {
    const c = this.ctrl;
    c.update(dt, this.rig.sYaw); // W luôn là "đi về phía camera đang nhìn"
    const me = this.me;
    me.moving = c.moving;
    if (c.moving) me.faceTo(c.angle);
    me.setPosition(c.pos.x, c.pos.z);
    me.update(dt, t);

    // gửi vị trí ~15 lần/giây khi đổi
    const ls = this.lastSent, now = performance.now();
    if (now - ls.t > SEND_MS) {
      const x = Math.round(c.pos.x * PX), z = Math.round(c.pos.z * PX), rot = Math.round(c.angle * 100) / 100;
      if (x !== ls.x || z !== ls.z || rot !== ls.rot || c.moving !== ls.moving) {
        socket.emit('world:move', { x, y: z, rot, moving: c.moving, dir: 'down' });
        Object.assign(ls, { t: now, x, z, rot, moving: c.moving });
        this.character.lastPos = { x, y: z };
      }
    }

    // người khác: nội suy
    const a = Math.min(1, dt * 10);
    for (const r of this.remotes.values()) {
      const p = r.av.root.position;
      if (Math.abs(r.tx - p.x) > 8 || Math.abs(r.tz - p.z) > 8) p.set(r.tx, 0, r.tz);
      else { p.x += (r.tx - p.x) * a; p.z += (r.tz - p.z) * a; }
      r.av.moving = r.moving;
      r.av.faceTo(r.rot);
      r.av.update(dt, t);
    }

    // cửa
    let near = null;
    if (store.room === 'lobby') {
      for (const b of BUILDINGS) if (Math.hypot(c.pos.x - b.door3d.x, c.pos.z - b.door3d.z) < DOOR_RANGE) { near = b; break; }
    }
    if (near !== this.nearDoor) { this.nearDoor = near; store.emit('near-door', near); }

    // camera bám theo, ánh nắng + bóng đổ đi theo nhân vật
    this.rig.update(dt, c.pos.x, c.pos.z, this.camera, (p) => p.y > 0.4);
    this.sun.position.set(c.pos.x - 8, 18, c.pos.z + 6);
    this.sun.target.position.set(c.pos.x, 0, c.pos.z);

    this.fountain.userData.animate(t);
  }

  afterRender() {
    if (!this.active) return;
    const proj = (v) => this.engine.project(v);
    const put = (id, av) => { const s = proj(av.topPosition()); this.labels.position(id, s.x, s.y); };
    put('me', this.me);
    for (const [id, r] of this.remotes) if (r.av.root.visible) put(id, r.av);
    for (const s of this.signs) {
      const p = proj(s.pos);
      s.el.hidden = !p.visible;
      s.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }

  /** Rời phòng → đứng trước cửa tòa nhà đó. */
  placeAtDoor(roomId) {
    const b = BUILDINGS.find((x) => x.id === roomId);
    if (b) this.ctrl.pos = { x: b.door3d.x, z: b.door3d.z + 0.4 };
    this.ctrl.angle = 0;
    this.me.root.rotation.y = 0;
    this.ctrl.target = null;
    this.lastSent.x = NaN; // buộc gửi lại vị trí sảnh (trong phòng tranh mình đã gửi tọa độ khác)
  }
}
