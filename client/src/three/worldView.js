// 🏮 Sảnh 3D: khu phố Hội Quán. 1 ô của bản đồ cũ = 1 mét. Server vẫn dùng đơn vị px (×16).
import * as THREE from 'three';
import { Q } from './quality.js';
import { cheapen } from './engine.js';
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { Avatar } from './avatar.js';
import { Controller } from './controller.js';
import { OrbitRig } from './orbit.js';
import { Fireworks } from './fireworks.js';
import { Weather } from './weather.js';
import { Pet } from './pet.js';
import { FoodWheel } from './foodWheel.js';
import { Sky } from './sky.js';
import { Critters } from './critters.js';
import { Nature, FRUITS } from './nature.js';
import { EMOTES } from './expressions.js';
import { sound } from '../ui/sound.js';
import { Labels } from '../ui/labels.js';
import { mat, textures, tree, lamp, bench, house, fountain } from './props.js';
import { MAP_W, MAP_H, BUILDINGS, SPAWN, FOUNTAIN, POND, GROUND, LAKE, DOCK, GARDEN, GAZEBO, PLAZA, BENCHES, SEATS, inHouse, treePositions } from '../game/map.js';

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
    } else if (t === 4) { // cỏ vườn đào lấm tấm cánh hoa hồng
      c.fillStyle = '#7cb35f'; c.fillRect(x, y, S, S);
      for (let k = 0; k < 7; k++) { c.fillStyle = ['#ffc1d9', '#ff9ec4', '#fff0f6'][k % 3]; c.beginPath(); c.ellipse(x + r() * S, y + r() * S, S * 0.09, S * 0.05, r() * 3, 0, 7); c.fill(); }
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
    this.rig = new OrbitRig({ dist: 8.5, minDist: 3.5, maxDist: 22, pitch: 0.62, minPitch: -0.6, maxPitch: 1.3, height: 1.0 }); // minPitch âm = ngước nhìn trời
    this.labels = new Labels(document.getElementById('world-labels'));
    this.remotes = new Map();
    this.nearDoor = null;
    this.lastSent = { t: 0, x: 0, z: 0, rot: 0, moving: false };
    this.active = false;

    this.buildWorld();
    this.fx = new Fireworks(this.scene);
    this.weather = new Weather(this.scene);
    this.weatherType = 'clear';
    this.fishers = new Map(); // id -> hình cần câu + phao
    this.fishing = null;      // trạng thái câu của mình
    this.setupNight();
    this.ctrl = new Controller({ bounds: { x0: 1, z0: 1, x1: MAP_W - 1, z1: MAP_H - 1 }, rects: this.rects, circles: this.circles, obbs: this.obbs });
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
    // Nhà xếp vòng quanh đài phun nước, cửa quay vào giữa (xem PLAZA/BUILDINGS trong map.js)
    this.obbs = [];
    for (const b of BUILDINGS) {
      const h = house({ w: b.w, d: b.d, wall: b.wall, roof: b.roof });
      h.position.set(b.cx, 0, b.cz);
      h.rotation.y = b.rot;
      s.add(h);
      this.obbs.push(b); // va chạm: hình chữ nhật xoay theo nhà
      b.door3d = b.door;
      (this.doors ||= {})[b.id] = b.door;
      this.signs.push({ el: this.labels.addSign(`${b.icon} ${b.name}`), pos: new THREE.Vector3(b.cx + b.dir.x * (b.d / 2 + 0.2), 4.1, b.cz + b.dir.z * (b.d / 2 + 0.2)) });
    }

    // Đài phun nước
    const f = (this.fountain = fountain());
    f.position.set(FOUNTAIN.x / PX, 0, FOUNTAIN.y / PX);
    s.add(f);
    this.circles.push({ x: f.position.x, z: f.position.z, r: 1.45 });

    // 🎡 Vòng quay "Hôm nay ăn gì?" cạnh đài phun nước, quay mặt về phía điểm xuất hiện
    const W0 = { x: PLAZA.x - 4.6, z: PLAZA.z - 0.6 };
    W0.ry = Math.atan2(SPAWN.x / PX - W0.x, SPAWN.y / PX - W0.z);
    this.wheel = new FoodWheel(s, W0);
    this.wheelFront = { x: W0.x + Math.sin(W0.ry) * 1.5, z: W0.z + Math.cos(W0.ry) * 1.5 };
    this.circles.push({ x: W0.x, z: W0.z, r: 0.75 });
    this.wheel.onTick = () => { if (this.active && Math.hypot(this.ctrl.pos.x - W0.x, this.ctrl.pos.z - W0.z) < 18) sound.play('tick'); };
    this.wheel.onDone = (i) => {
      const f = this.wheel.foods?.[i];
      store.emit('wheel-busy', false);
      if (f && this.active && Math.hypot(this.ctrl.pos.x - W0.x, this.ctrl.pos.z - W0.z) < 18) { store.emit('wheel-result', { ...f, by: this.wheelBy }); sound.play('win'); }
    };

    // Đèn xếp vòng quanh sân + ghế đá quay vào đài phun nước
    // đèn đứng ở khoảng giữa 2 nhà (không chắn cửa) + 2 cột đèn hai bên lối xuống công viên
    for (const [deg, rad] of [[36, 10.4], [144, 10.4], [192, 10.4], [240, 10.4], [288, 10.4], [80, 12], [100, 12]]) {
      const a = (deg * Math.PI) / 180, x = PLAZA.x + Math.cos(a) * rad, z = PLAZA.z + Math.sin(a) * rad;
      const l = lamp(); l.position.set(x, 0, z); s.add(l);
      this.circles.push({ x, z, r: 0.15 });
    }
    // 🪑 ghế (ngồi được – xem BENCHES/SEATS trong map.js)
    this.benchMeshes = BENCHES.map((b, i) => {
      const g = bench(); g.position.set(b.x, b.y, b.z); g.rotation.y = b.ry; g.userData.bench = i; s.add(g);
      this.obbs.push({ cx: b.x, cz: b.z, rot: b.ry, w: 1.3, d: 0.42 });
      return g;
    });

    this.buildLake();
    this.buildGarden();
    this.buildPark();
    // Cây (gộp instanced cho nhẹ)
    this.buildTrees(treePositions());
    this.nature = new Nature(s, this.treeGroups);
    this.critters = new Critters(s);
    cheapen(s);
  }

  // 🎣 Hồ câu cá + bến gỗ (đi ra giữa hồ được)
  buildLake() {
    const s = this.scene, L = LAKE;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h, 28, 18), new THREE.MeshStandardMaterial({ color: '#2f86c9', roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2; water.position.set(L.x + L.w / 2, 0.03, L.y + L.h / 2);
    s.add(water);
    this.lakeWater = water;
    this.lakeBase = Float32Array.from(water.geometry.attributes.position.array);
    const rim = mat('#8f8a84');
    for (const [w, d, x, z] of [[L.w + 0.6, 0.3, L.x + L.w / 2, L.y - 0.15], [L.w + 0.6, 0.3, L.x + L.w / 2, L.y + L.h + 0.15], [0.3, L.h, L.x - 0.15, L.y + L.h / 2], [0.3, L.h, L.x + L.w + 0.15, L.y + L.h / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), rim);
      m.position.set(x, 0.11, z); m.castShadow = m.receiveShadow = true; s.add(m);
    }
    // lá sen + hoa sen
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.4, 14, 0.3, Math.PI * 1.8), mat('#4f9a45'), 14);
    const lotus = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.2, 6), mat('#ff8fb8', { emissive: '#ff5c9e', emissiveIntensity: 0.2 }), 6);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    let seed = 3; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 14; i++) {
      const x = L.x + 1 + r() * (L.w - 2), z = L.y + 1 + r() * (L.h - 2);
      if (Math.abs(x - (DOCK.x + 1)) < 1.5) continue;
      pads.setMatrixAt(i, mtx.compose(new THREE.Vector3(x, 0.05, z), q.setFromEuler(e.set(-Math.PI / 2, 0, r() * 6)), one));
      if (i < 6) lotus.setMatrixAt(i, mtx.compose(new THREE.Vector3(x + 0.1, 0.15, z), q.identity(), one));
    }
    s.add(pads, lotus);
    // bến gỗ
    const wood = mat('#8a5a3c', { roughness: 0.8 });
    const deckLen = DOCK.h + 0.5;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(DOCK.w, 0.12, deckLen), wood);
    deck.position.set(DOCK.x + DOCK.w / 2, 0.18, DOCK.y + deckLen / 2 - 0.25); deck.castShadow = deck.receiveShadow = true;
    s.add(deck);
    for (let k = 0; k <= 3; k++) for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), mat('#5a3a24'));
      post.position.set(DOCK.x + DOCK.w / 2 + sx * (DOCK.w / 2 - 0.1), 0.2, DOCK.y + k * (deckLen / 3)); s.add(post);
    }
    // va chạm: nước chặn, chừa đường đi trên bến
    this.rects.push({ x: L.x, z: L.y, w: DOCK.x - L.x, d: L.h }, { x: DOCK.x + DOCK.w, z: L.y, w: L.x + L.w - DOCK.x - DOCK.w, d: L.h }, { x: DOCK.x, z: L.y, w: DOCK.w, d: DOCK.y - L.y });
    this.lakeRect = L;
  }

  // 🌸 Vườn hoa đào
  buildGarden() {
    const s = this.scene, G = GARDEN;
    const list = [];
    let seed = 21; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 60 && list.length < 22; i++) {
      const x = G.x + 1 + r() * (G.w - 2), z = G.y + 1 + r() * (G.h - 2);
      const tile = GROUND[Math.floor(z)]?.[Math.floor(x)];
      if (tile !== 4 || list.some(([a, b]) => Math.hypot(a - x, b - z) < 1.8)) continue;
      list.push([x, z]);
    }
    const trunk = new THREE.CylinderGeometry(0.1, 0.16, 1.1, 7); trunk.translate(0, 0.55, 0);
    const trunks = new THREE.InstancedMesh(trunk, mat('#5b3a2e'), list.length);
    const blossoms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, Q.level === 'low' ? 0 : 1), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 }), list.length * 4);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const pinks = ['#ffb7d0', '#ff9ec4', '#ffc8dd', '#f7a1c4', '#fff0f6'];
    list.forEach(([x, z], i) => {
      const k = 0.9 + r() * 0.4;
      trunks.setMatrixAt(i, m.compose(p.set(x, 0, z), q.identity(), sc.set(k, k, k)));
      for (let j = 0; j < 4; j++) {
        const s2 = (0.55 - j * 0.07) * k;
        blossoms.setMatrixAt(i * 4 + j, m.compose(p.set(x + (r() - 0.5) * 0.7, (1.25 + r() * 0.5) * k, z + (r() - 0.5) * 0.7), q.setFromEuler(new THREE.Euler(r(), r(), r())), sc.set(s2, s2 * 0.8, s2)));
        blossoms.setColorAt(i * 4 + j, col.set(pinks[Math.floor(r() * pinks.length)]));
      }
      this.circles.push({ x, z, r: 0.3 });
    });
    for (const im of [trunks, blossoms]) { im.castShadow = true; im.receiveShadow = true; s.add(im); }
    (this.treeGroups ||= []).push({ kind: 'sakura', list, trunks, leaves: blossoms, per: 4 });
    // đèn đá kiểu Nhật + ghế
    const stone = mat('#9c968e', { roughness: 0.9 });
    for (const [x, z] of [[51.5, 5.5], [56.5, 5.5], [51.5, 8.5], [56.5, 8.5]]) {
      const g = new THREE.Group();
      const parts = [[new THREE.CylinderGeometry(0.22, 0.28, 0.2, 6), 0.1], [new THREE.CylinderGeometry(0.08, 0.1, 0.55, 6), 0.47], [new THREE.BoxGeometry(0.4, 0.3, 0.4), 0.88], [new THREE.ConeGeometry(0.38, 0.28, 4), 1.17]];
      for (const [geo, y] of parts) { const o = new THREE.Mesh(geo, stone); o.position.y = y; o.castShadow = true; g.add(o); }
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb347', emissiveIntensity: 1.2 }));
      glow.position.y = 0.88; g.add(glow);
      g.children[3].rotation.y = Math.PI / 4;
      g.position.set(x, 0, z); s.add(g);
      this.circles.push({ x, z, r: 0.3 });
    }
  }

  // 🏯 Công viên: chòi nghỉ + luống hoa
  buildPark() {
    const s = this.scene, { x, y: z } = GAZEBO;
    const g = new THREE.Group();
    const red = mat('#b33a2e'), roofM = mat('#3e5a46', { roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, 0.25, 6), mat('#cbb79a'));
    base.position.y = 0.12; base.receiveShadow = true; g.add(base);
    const pillar = new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8);
    const pillars = new THREE.InstancedMesh(pillar, red, 6);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; pillars.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * 1.9, 1.35, Math.sin(a) * 1.9)); }
    pillars.castShadow = true; g.add(pillars);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.3, 6, 1, true), roofM);
    roof.position.y = 3.05; roof.castShadow = true; g.add(roof);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat('#d8b04a', { metalness: 0.8, roughness: 0.3 }));
    tip.position.y = 3.75; g.add(tip);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#ff3b1f', emissiveIntensity: 1.2 }));
    lantern.scale.y = 1.3; lantern.position.y = 2.2; g.add(lantern);
    g.position.set(x, 0, z); s.add(g);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.circles.push({ x: x + Math.cos(a) * 1.9, z: z + Math.sin(a) * 1.9, r: 0.15 }); }
    // luống hoa 2 bên công viên (instanced)
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 240);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const cs = ['#ff6b6b', '#ffd166', '#ff9ec4', '#c77dff', '#ffffff', '#ff8a4c'];
    let n = 0, seed = 9; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const [bx, bz, bw, bd] of [[12, 37.5, 6, 2], [12, 41, 6, 2], [31, 37.5, 6, 2], [31, 41, 6, 2]]) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.16, bd), mat('#6b4a32'));
      bed.position.set(bx + bw / 2, 0.08, bz + bd / 2); bed.receiveShadow = true; s.add(bed);
      this.rects.push({ x: bx, z: bz, w: bw, d: bd });
      for (let k = 0; k < 60; k++) {
        flowers.setMatrixAt(n, m.makeTranslation(bx + 0.2 + r() * (bw - 0.4), 0.25, bz + 0.2 + r() * (bd - 0.4)));
        flowers.setColorAt(n++, col.set(cs[Math.floor(r() * cs.length)]));
      }
    }
    flowers.castShadow = true; s.add(flowers);
  }

  buildTrees(list) {
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.9, 7);
    trunkGeo.translate(0, 0.45, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, Q.level === 'low' ? 0 : 1); // máy yếu: tán lá 20 mặt thay vì 80
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
    (this.treeGroups ||= []).push({ kind: 'tree', list, trunks, leaves, per: 3 });
  }

  // ---------------- Ngày / đêm theo giờ Việt Nam ----------------
  setupNight() {
    // gom các vật phát sáng (đèn, cửa sổ, đèn lồng) + đèn điểm để tối thì sáng hơn
    const mats = new Set();
    this.glows = []; this.nightLights = [];
    this.scene.traverse((o) => {
      if (o.isPointLight) this.nightLights.push({ l: o, base: o.intensity });
      const m = o.material;
      if (m && !Array.isArray(m) && m.emissive && m.emissiveIntensity > 0 && !mats.has(m) && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) { mats.add(m); this.glows.push({ m, base: m.emissiveIntensity }); }
    });
    // vòm trời 3D (ngước camera lên là thấy thiên đỉnh, mặt trời/trăng, mây, sao)
    this.sky = new Sky(this.scene);
    this.scene.background = new THREE.Color('#a8d0f0');
    this.forceHour = null;
    this.applyTime();
  }

  /** Giờ hiện tại ở Việt Nam (UTC+7), dạng số thập phân 0..24. */
  vnHour() {
    if (this.forceHour != null) return this.forceHour;
    const d = new Date();
    return ((d.getUTCHours() + 7) % 24) + d.getUTCMinutes() / 60;
  }

  applyTime() {
    const h = this.vnHour();
    const day = THREE.MathUtils.clamp(Math.min((h - 5) / 1.5, (19 - h) / 1.5), 0, 1); // 0 = đêm, 1 = ngày
    const night = 1 - day;
    const C = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    const DAY = ['#4f8fd8', '#a8d0f0', '#e8f2fb'], GOLD = ['#5d7fc4', '#f2b07c', '#ffd9a8'], NIGHT = ['#050a22', '#18204a', '#2c2a55'];
    const stops = [0, 1, 2].map((i) => (day < 0.5 ? C(NIGHT[i], GOLD[i], day * 2) : C(GOLD[i], DAY[i], (day - 0.5) * 2)));
    // mưa/tuyết: trời xám, nắng yếu, sương gần hơn
    const W = this.weatherType;
    const grey = W === 'rain' ? 0.6 : W === 'snow' ? 0.35 : 0;
    if (grey) for (const st of stops) st.lerp(new THREE.Color(W === 'rain' ? '#6f7b8a' : '#dfe6ee'), grey * (0.4 + 0.6 * day));
    this.sky.set(stops, h, night, grey ? 1 : 0);
    this.scene.background.copy(stops[2]);
    this.scene.fog.color.copy(stops[2]);
    this.scene.fog.near = W === 'rain' ? 14 : 26; this.scene.fog.far = W === 'rain' ? 42 : 60;
    this.sun.intensity = (0.25 + 2.2 * day) * (W === 'rain' ? 0.45 : W === 'snow' ? 0.7 : 1);
    this.sun.color.copy(C('#ffb070', '#fff3e0', Math.max(0, day * 2 - 1)));
    this.hemi ||= this.scene.children.find((o) => o.isHemisphereLight);
    this.hemi.intensity = 0.45 + 0.7 * day;
    this.hemi.color.copy(C('#7d8cff', '#ffe9c7', day));
    for (const g of this.glows) g.m.emissiveIntensity = g.base * (1 + 1.6 * night);
    for (const l of this.nightLights) l.l.intensity = l.base * (0.35 + 1.5 * night);
    const hh = Math.floor(h), mm = String(Math.floor((h - hh) * 60)).padStart(2, '0');
    store.emit('time', { text: `${night > 0.5 ? '🌙' : day < 1 ? '🌇' : '☀️'} ${hh}:${mm}` });
    this.timeAt = performance.now();
  }

  spinWheel() { if (!this.wheel.spinning && !this.wheelRequested) { this.wheelRequested = true; setTimeout(() => { this.wheelRequested = false; }, 800); socket.emit('wheel:spin'); } }

  setWeather(type) {
    this.weatherType = type;
    this.weather.set(type);
    this.applyTime();
  }

  // ---------------- 🎣 Câu cá ----------------
  /** Đang đứng ven hồ (hoặc trên bến) → câu được. */
  canFish() {
    const { x, z } = this.ctrl.pos, L = this.lakeRect;
    const onDock = x > DOCK.x && x < DOCK.x + DOCK.w && z > L.y + 2 && z < L.y + L.h + 0.6;
    const dx = Math.max(L.x - x, 0, x - (L.x + L.w)), dz = Math.max(L.y - z, 0, z - (L.y + L.h));
    return onDock || (Math.hypot(dx, dz) < 1.3 && (dx > 0 || dz > 0));
  }
  castLine() {
    const { x, z } = this.ctrl.pos, L = this.lakeRect;
    const cx = L.x + L.w / 2, cz = L.y + L.h / 2;
    let dx = cx - x, dz = cz - z;
    const onDock = x > DOCK.x && x < DOCK.x + DOCK.w && z > L.y && z < L.y + L.h;
    if (onDock) { dx = 0; dz = -1; } // trên bến: quăng thẳng ra giữa hồ
    const len = Math.hypot(dx, dz) || 1;
    const bx = THREE.MathUtils.clamp(x + (dx / len) * 2.6, L.x + 0.5, L.x + L.w - 0.5);
    const bz = THREE.MathUtils.clamp(z + (dz / len) * 2.6, L.y + 0.5, L.y + L.h - 0.5);
    const ang = Math.atan2(bx - x, bz - z);
    this.me.faceTo(ang); this.ctrl.angle = ang;
    this.fishing = { state: 'waiting', castAt: performance.now() };
    socket.emit('fish:cast', { x: bx, z: bz });
    store.emit('fish', { state: 'waiting' });
  }
  showFisher(id, on, bx, bz) {
    const old = this.fishers.get(id);
    if (old) { old.rod.removeFromParent(); old.line.removeFromParent(); old.bobber.removeFromParent(); old.ring.removeFromParent(); this.fishers.delete(id); }
    if (!on) return;
    const av = id === store.selfId ? this.me : this.remotes.get(id)?.av;
    if (!av) return;
    const rod = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.5, 6), mat('#6b4226'));
    stick.position.y = 0.75; rod.add(stick);
    rod.position.set(0.12, 0.38, 0.25); rod.rotation.x = 0.95;
    av.root.add(rod);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f5f5f5', transparent: true, opacity: 0.8 }));
    line.frustumCulled = false;
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#ff3b30', { emissive: '#ff3b30', emissiveIntensity: 0.4 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    bobber.position.set(bx, 0.08, bz); ring.position.set(bx, 0.05, bz);
    this.scene.add(line, bobber, ring);
    this.fishers.set(id, { rod, stick, line, bobber, ring, bite: false, bx, bz, ringT: 0 });
  }
  updateFishers(t, dt) {
    const tip = new THREE.Vector3();
    for (const f of this.fishers.values()) {
      f.stick.localToWorld(tip.set(0, 0.75, 0));
      const dip = f.bite ? -0.09 + Math.sin(t * 30) * 0.04 : Math.sin(t * 2.5 + f.bx) * 0.02;
      f.bobber.position.y = 0.08 + dip;
      const a = f.line.geometry.attributes.position.array;
      a[0] = tip.x; a[1] = tip.y; a[2] = tip.z; a[3] = f.bx; a[4] = f.bobber.position.y; a[5] = f.bz;
      f.line.geometry.attributes.position.needsUpdate = true;
      if (f.bite) { f.ringT = (f.ringT + dt * 1.6) % 1; f.ring.scale.setScalar(1 + f.ringT * 5); f.ring.material.opacity = 0.8 * (1 - f.ringT); }
      else f.ring.material.opacity = 0;
    }
  }

  // ---------------- Hành động & pháo hoa ----------------
  emote(id, type) {
    const av = id === store.selfId ? this.me : this.remotes.get(id)?.av;
    if (!av) return;
    av.emote(type);
    const f = EMOTES[type]?.float;
    if (f) this.emoji(id, f);
  }

  // ---------------- 🪑 ngồi ghế · 🐾 vuốt ve · 🌳 rung cây ----------------
  seatTaken(i) { for (const p of store.players.values()) if (p.seat === i && p.id !== store.selfId && p.room === 'lobby') return true; return false; }
  sit(i) {
    const st = SEATS[i];
    if (!st || this.seatTaken(i)) return;
    socket.emit('seat:sit', i, (r) => {
      if (!r?.ok) { store.emit('toast', r?.error || 'Không ngồi được'); return; }
      this.mySeat = i;
      this.ctrl.pos = { x: st.sx, z: st.sz };
      this.ctrl.target = null;
      this.ctrl.angle = st.ry;
      this.lastSent.x = NaN;
    });
  }
  stand() {
    if (this.mySeat == null) return;
    this.mySeat = null;
    this.me.sitting = false;
    socket.emit('seat:stand');
  }
  /** Đặt nhân vật lên ghế (mình hoặc người khác). */
  placeSeated(av, i) {
    const st = SEATS[i];
    av.setPosition(st.x, st.z, st.y);
    av.root.rotation.y = st.ry; av.faceTo(st.ry);
    av.sitting = true; av.moving = false;
  }
  petCritter(c) {
    this.me.faceTo(Math.atan2(c.x - this.ctrl.pos.x, c.z - this.ctrl.pos.z));
    this.ctrl.angle = this.me.targetRot;
    socket.emit('critter:pet', c.i);
  }
  shakeTree(tr) {
    this.me.faceTo(Math.atan2(tr.x - this.ctrl.pos.x, tr.z - this.ctrl.pos.z));
    this.ctrl.angle = this.me.targetRot;
    this.me.jump();
    socket.emit('tree:shake', { kind: tr.kind, i: tr.i });
  }
  critterLabel(c) {
    const id = `c${c.i}`;
    if (!this.labels.items.has(id)) { this.labels.add(id, `${c.icon} ${c.name}`, false); this.labels.items.get(id).el.classList.add('critter'); }
    return id;
  }
  /** Thứ tương tác được ở gần (sau cửa/vòng quay): ghế, con vật, cây. */
  findThing() {
    const { x, z } = this.ctrl.pos;
    if (this.mySeat != null) return { type: 'stand', key: 'stand' };
    let seat = -1, sd = 0.9;
    SEATS.forEach((st, i) => { const d = Math.hypot(st.sx - x, st.sz - z); if (d < sd && !this.seatTaken(i)) { sd = d; seat = i; } });
    if (seat >= 0) return { type: 'seat', i: seat, key: `s${seat}` };
    if (this.canFish()) return null; // ven hồ: ưu tiên câu cá (vịt thì bấm thẳng vào con vịt)
    const c = this.critters.nearest(x, z);
    if (c) return { type: 'critter', c, key: `c${c.i}` };
    const tr = this.nature.nearest(x, z, 1.35);
    if (tr) return { type: 'tree', tr, key: `${tr.kind}${tr.i}` };
    return null;
  }
  doThing(th) {
    if (th.type === 'stand') this.stand();
    else if (th.type === 'seat') this.sit(th.i);
    else if (th.type === 'critter') this.petCritter(th.c);
    else if (th.type === 'tree') this.shakeTree(th.tr);
  }
  /** Nhấn E / chạm gợi ý. */
  interact() {
    if (store.room !== 'lobby') return;
    if (this.nearDoor && !this.fishing) return store.emit('enter-room', this.nearDoor.id);
    if (this.fishing) return socket.emit('fish:reel');
    if (this.nearWheel) return this.spinWheel();
    const th = this.thing;
    if (th && (th.type === 'stand' || th.type === 'seat')) return this.doThing(th);
    if (this.canFish()) return this.castLine();
    if (th) this.doThing(th);
  }
  fireworks(x, y) {
    const fx = x / PX, fz = y / PX - 7; // nổ phía trước mặt (phía bắc)
    this.fx.launch(fx, fz);
    // ở gần → camera tự ngước lên ngắm ~4 giây rồi trả lại góc cũ (nếu mình không tự xoay)
    if (!this.active || Math.hypot(fx - this.ctrl.pos.x, fz - this.ctrl.pos.z) > 30) return;
    const r = this.rig, prev = this._lookUpFrom ?? r.pitch;
    this._lookUpFrom = prev;
    r.pitch = Math.min(r.pitch, 0.12);
    const set = r.pitch;
    clearTimeout(this._lookUpT);
    this._lookUpT = setTimeout(() => { if (Math.abs(r.pitch - set) < 1e-3) r.pitch = prev; this._lookUpFrom = null; }, 4200);
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
    this.myPet?.dispose();
    this.myPet = character.appearance.pet ? new Pet(['', 'cat', 'dog', 'chick', 'bunny'][character.appearance.pet], this.scene) : null;
  }

  addRemote(p) {
    if (this.remotes.has(p.id) || p.id === store.selfId) return;
    const av = new Avatar(p.appearance);
    av.setPosition(p.x / PX, p.y / PX);
    av.root.rotation.y = p.rot || 0;
    av.root.visible = p.room === 'lobby';
    this.scene.add(av.root);
    const pet = p.appearance?.pet ? new Pet(['', 'cat', 'dog', 'chick', 'bunny'][p.appearance.pet], this.scene) : null;
    this.remotes.set(p.id, { av, pet, tx: p.x / PX, tz: p.y / PX, rot: p.rot || 0, moving: false });
    this.labels.add(p.id, store.displayName(p), false);
    this.labels.setVisible(p.id, p.room === 'lobby' && this.active);
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.av.dispose();
    r.pet?.dispose();
    this.showFisher(id, false);
    this.remotes.delete(id);
    this.labels.remove(id);
  }

  // ---------------- Input ----------------
  onKey(code) {
    if (store.room !== 'lobby') return;
    if (code === 'KeyE') this.interact();
    if (code === 'KeyQ') store.emit('toggle-emotes');
    const digit = /^(?:Digit|Numpad)([1-6])$/.exec(code);
    if (digit) socket.emit('emoji:send', +digit[1] - 1);
    const em = { Digit7: 'dance', Digit8: 'bow', Digit9: 'wave', Digit0: 'spin' }[code];
    if (em) socket.emit('emote:send', em);
    if (code === 'KeyF') socket.emit('fx:fireworks');
    if (code === 'Equal' || code === 'NumpadAdd') this.rig.zoom(-1.5);
    if (code === 'Minus' || code === 'NumpadSubtract') this.rig.zoom(1.5);
  }

  // Kéo để xoay camera, chạm/click (không kéo) để đi tới chỗ đó
  setupPointer() {
    this.rig.onTap = (e) => {
      if (!this.active || store.room !== 'lobby') return;
      // bấm thẳng vào vòng quay (đứng trong khoảng 12m) → quay
      const W = this.wheel.root.position;
      if (Math.hypot(this.ctrl.pos.x - W.x, this.ctrl.pos.z - W.z) < 12 && this.engine.pick(e.clientX, e.clientY, [this.wheel.root], true).length) { this.spinWheel(); return; }
      const { x, z } = this.ctrl.pos;
      const hits = this.engine.pick(e.clientX, e.clientY, [...this.critters.list.map((c) => c.mesh), ...this.benchMeshes, ...this.nature.meshes(), this.ground], true);
      for (const hit of hits) {
        if (hit.object === this.ground) {
          // chạm hụt chút xíu cạnh con vật (ngón tay to, vịt nhỏ) vẫn tính là chạm vào nó
          const c = this.critters.list.find((c) => Math.hypot(c.x - hit.point.x, c.z - hit.point.z) < 0.9 && Math.hypot(c.x - x, c.z - z) < (c.water ? 11 : 7));
          if (c) { this.petCritter(c); return; }
          this.ctrl.goTo(hit.point.x, hit.point.z); this.pendingSeat = null; return;
        }
        const ci = hit.object.userData.critter;
        if (ci != null) {
          const c = this.critters.list[ci];
          if (Math.hypot(c.x - x, c.z - z) < (c.water ? 11 : 7)) { this.petCritter(c); return; } // vịt dưới nước: bấm từ bờ
          this.ctrl.goTo(c.x, c.z); return;
        }
        let b = hit.object; while (b && b.userData.bench == null) b = b.parent;
        if (b) { // bấm vào ghế → đi tới rồi ngồi vào chỗ trống gần nhất
          const free = SEATS.map((st, i) => ({ st, i })).filter(({ st, i }) => st.bench === b.userData.bench && !this.seatTaken(i));
          if (!free.length) { store.emit('toast', 'Ghế này có người ngồi rồi'); return; }
          free.sort((p, q) => Math.hypot(p.st.sx - x, p.st.sz - z) - Math.hypot(q.st.sx - x, q.st.sz - z));
          this.stand();
          this.pendingSeat = free[0].i; this.ctrl.goTo(free[0].st.sx, free[0].st.sz); return;
        }
        const tr = this.nature.fromHit(hit);
        if (tr) {
          const [tx, tz] = this.nature.groups[tr.kind].list[tr.i];
          if (Math.hypot(tx - x, tz - z) < 5) { this.shakeTree({ ...tr, x: tx, z: tz }); return; }
          continue; // cây ở xa: coi như bấm xuống đất phía sau
        }
      }
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
        socket.emit('weather:sync');
        socket.emit('wheel:sync');
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
      weather: ({ type }) => this.setWeather(type),
      'world:seat': ({ id, seat }) => {
        const p = store.players.get(id);
        if (p) p.seat = seat;
        if (id === store.selfId) { this.mySeat = seat; if (seat == null) this.me.sitting = false; }
        else { const r = this.remotes.get(id); if (r && seat == null) r.av.sitting = false; }
      },
      'critter:pet': ({ id, i }) => {
        const c = this.critters.list[i];
        if (!c) return;
        this.critters.react(i);
        if (!this.active) return;
        if (Math.hypot(c.x - this.ctrl.pos.x, c.z - this.ctrl.pos.z) < 14) { this.labels.emoji(this.critterLabel(c), ['💕', '❤️', '💖'][Math.floor(Math.random() * 3)]); sound.play(c.sound); }
        const r = id === store.selfId ? null : this.remotes.get(id);
        if (r) r.av.faceTo(Math.atan2(c.x - r.av.root.position.x, c.z - r.av.root.position.z));
      },
      'tree:shake': ({ id, kind, i, out }) => {
        this.nature.shake(kind, i, out);
        const pos = this.nature.groups[kind]?.list[i];
        if (!pos || !this.active || Math.hypot(pos[0] - this.ctrl.pos.x, pos[1] - this.ctrl.pos.z) > 16) return;
        sound.play(out.type === 'bird' ? 'chirp' : 'rustle');
        if (out.type === 'fruit') setTimeout(() => this.emoji(id, FRUITS[out.fruit]?.icon || '🍊'), 700);
        if (out.type === 'bird') this.emoji(id, '🐦');
      },
      'tree:got': ({ fruit, total }) => { const f = FRUITS[fruit]; if (f) store.emit('toast', `🧺 Hái được 1 quả ${f.name} ${f.icon} · trong giỏ: ${total} quả`); },
      'world:playerUpdated': ({ id, admin }) => {
        const p = store.players.get(id);
        if (!p) return;
        p.admin = admin;
        const name = store.displayName(p);
        this.labels.rename(id === store.selfId ? 'me' : id, name);
        this.engine.view?.renameLabel?.(id, name); // nhãn trong phòng đang đứng
        store.emit('players-changed');
        if (id === store.selfId) store.emit('admin', admin);
      },
      'wheel:state': ({ foods, spin }) => { this.wheel.setFoods(foods); if (spin) { this.wheelBy = spin.by; this.wheel.spinTo(spin.index, spin.elapsed, spin.duration); } },
      'wheel:spin': ({ index, by, elapsed, duration }) => { this.wheelBy = by; this.wheel.spinTo(index, elapsed, duration); store.emit('wheel-spin', { by }); store.emit('wheel-busy', true); },
      'fish:state': ({ id, fishing, x, z }) => {
        this.showFisher(id, fishing, x, z);
        if (id === store.selfId && !fishing) { this.fishing = null; store.emit('fish', { state: 'idle' }); }
      },
      'fish:bite': ({ id }) => {
        const f = this.fishers.get(id);
        if (f) f.bite = true;
        if (id === store.selfId && this.fishing) { this.fishing.state = 'bite'; store.emit('fish', { state: 'bite' }); }
      },
      'fish:result': (res) => store.emit('fish', { state: 'result', ...res }),
      'fish:caught': ({ id, icon }) => this.labels.emoji(this.labelId(id), icon),
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
    if (this.mySeat != null && c.moving) this.stand(); // đi tiếp → đứng dậy
    if (this.pendingSeat != null && !c.target) { // bấm vào ghế → tới nơi thì ngồi
      const st = SEATS[this.pendingSeat];
      if (Math.hypot(st.sx - c.pos.x, st.sz - c.pos.z) < 0.4) this.sit(this.pendingSeat);
      this.pendingSeat = null;
    }
    if (this.mySeat != null) this.placeSeated(me, this.mySeat);
    else {
      me.moving = c.moving;
      if (c.moving) me.faceTo(c.angle);
      me.setPosition(c.pos.x, c.pos.z);
    }
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
    for (const [id, r] of this.remotes) {
      const p = r.av.root.position;
      if (Math.abs(r.tx - p.x) > 8 || Math.abs(r.tz - p.z) > 8) p.set(r.tx, 0, r.tz);
      else { p.x += (r.tx - p.x) * a; p.z += (r.tz - p.z) * a; }
      const seat = store.players.get(id)?.seat;
      if (seat != null && SEATS[seat]) this.placeSeated(r.av, seat);
      else { r.av.moving = r.moving; r.av.faceTo(r.rot); p.y = 0; }
      r.av.update(dt, t);
    }

    // cửa
    let near = null;
    if (store.room === 'lobby') {
      for (const b of BUILDINGS) if (Math.hypot(c.pos.x - b.door3d.x, c.pos.z - b.door3d.z) < DOOR_RANGE) { near = b; break; }
    }
    if (near !== this.nearDoor) { this.nearDoor = near; store.emit('near-door', near); }

    // camera bám theo, ánh nắng + bóng đổ đi theo nhân vật
    this.rig.update(dt, c.pos.x, c.pos.z, this.camera, (p) => p.y > 0.4 && !(p.y < 3.9 && BUILDINGS.some((b) => inHouse(b, p.x, p.z, 0.5)))); // không cho camera chui vào nhà
    this.sun.position.set(c.pos.x - 8, 18, c.pos.z + 6);
    this.sun.target.position.set(c.pos.x, 0, c.pos.z);

    this.fountain.userData.animate(t);
    if (Math.hypot(c.pos.x - (LAKE.x + LAKE.w / 2), c.pos.z - (LAKE.y + LAKE.h / 2)) < 22) {
      const pos = this.lakeWater.geometry.attributes.position, b = this.lakeBase;
      for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 2] = Math.sin(b[i * 3] * 1.3 + t * 1.6) * 0.03 + Math.cos(b[i * 3 + 1] * 1.1 + t * 1.2) * 0.03;
      pos.needsUpdate = true;
    }
    this.fx.update(dt);
    this.weather.update(dt, t, c.pos);
    this.sky.update(dt, this.camera.position);
    this.myPet?.update(dt, t, this.me.root);
    for (const r of this.remotes.values()) if (r.pet) { r.pet.root.visible = r.av.root.visible; r.pet.update(dt, t, r.av.root); }
    if (this.fishers.size) this.updateFishers(t, dt);
    // đang câu mà đi chỗ khác → thu cần
    if (this.fishing && c.moving && performance.now() - this.fishing.castAt > 300) { socket.emit('fish:stop'); this.fishing = null; store.emit('fish', { state: 'idle' }); }
    this.wheel.update(dt, t);
    const nearWheel = store.room === 'lobby' && !this.nearDoor && !this.fishing && Math.hypot(c.pos.x - this.wheelFront.x, c.pos.z - this.wheelFront.z) < 1.6;
    if (nearWheel !== this.nearWheel) { this.nearWheel = nearWheel; store.emit('near-wheel', nearWheel); }
    const fishable = store.room === 'lobby' && !this.nearDoor && !this.fishing && this.canFish();
    if (fishable !== this.fishable) { this.fishable = fishable; store.emit('near-fish', fishable); }
    this.critters.update(dt, t, c.pos);
    this.nature.update(dt, t);
    // ghế / con vật / cây ở gần → gợi ý (kiểm tra ~7 lần/giây cho nhẹ)
    if ((this._thingT = (this._thingT || 0) - dt) <= 0) {
      this._thingT = 0.15;
      const th = store.room === 'lobby' && !this.nearDoor && !this.nearWheel && !this.fishing ? this.findThing() : null;
      if ((th?.key ?? null) !== (this.thing?.key ?? null)) {
        this.thing = th;
        store.emit('near-thing', th && { type: th.type, label: th.type === 'critter' ? `${th.c.icon} ${th.c.name}` : th.type === 'tree' ? (th.tr.kind === 'sakura' ? '🌸 cây hoa đào' : '🌳 cây') : '🪑 ghế' });
      } else if (th) this.thing = th;
    }
    if (performance.now() - this.timeAt > 20000) this.applyTime(); // cập nhật trời mỗi 20 giây
  }

  afterRender() {
    if (!this.active) return;
    const proj = (v) => this.engine.project(v);
    const put = (id, av) => { const s = proj(av.topPosition()); this.labels.position(id, s.x, s.y); };
    put('me', this.me);
    for (const [id, r] of this.remotes) if (r.av.root.visible) put(id, r.av);
    const v = (this._cv ||= new THREE.Vector3());
    for (const c of this.critters.list) {
      const near = Math.abs(c.x - this.ctrl.pos.x) < 7 && Math.abs(c.z - this.ctrl.pos.z) < 7;
      const id = `c${c.i}`;
      if (!near) { if (this.labels.items.has(id)) this.labels.setVisible(id, false); continue; }
      this.critterLabel(c);
      const s = proj(this.critters.topOf(c, v));
      this.labels.setVisible(id, s.visible);
      this.labels.position(id, s.x, s.y);
    }
    for (const s of this.signs) {
      const p = proj(s.pos);
      s.el.hidden = !p.visible;
      s.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }

  /** Rời phòng → đứng trước cửa tòa nhà đó. */
  placeAtDoor(roomId) {
    this.mySeat = null; this.me.sitting = false; this.pendingSeat = null;
    const b = BUILDINGS.find((x) => x.id === roomId);
    if (b) this.ctrl.pos = { x: b.door.x + b.dir.x * 0.6, z: b.door.z + b.dir.z * 0.6 };
    const ang = b ? Math.atan2(b.dir.x, b.dir.z) : 0;
    this.ctrl.angle = ang;
    this.me.root.rotation.y = ang;
    this.rig.yaw = this.rig.sYaw = ang + Math.PI; // camera sau lưng, nhìn ra quảng trường
    this.ctrl.target = null;
    this.lastSent.x = NaN; // buộc gửi lại vị trí sảnh (trong phòng tranh mình đã gửi tọa độ khác)
  }
}
