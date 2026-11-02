// 🖼️ Phòng Tranh 3D: đi bộ ngắm ảnh trên tường + bệ trưng bày xoay giữa phòng, 6 chế độ đèn.
// Tối ưu: ảnh được thu nhỏ trước khi lên GPU (1024/640/384px theo chất lượng), đèn rọi là hiệu ứng giả (không tốn đèn thật).
import * as THREE from 'three';
import { Q } from '../quality.js';
import { cheapen } from '../engine.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomView } from '../roomView.js';
import { Controller } from '../controller.js';
import { OrbitRig } from '../orbit.js';
import { roomShell, mat } from '../props.js';
import { socket } from '../../net/socket.js';
import { store } from '../../store.js';

const W = 22, D = 19, H = 6;
const PX = 16;
const TEX_EDGE = { high: 1024, medium: 640, low: 384 }[Q.level];
const PEDESTALS = [[-6.5, -4], [-2.2, -4], [2.2, -4], [6.5, -4], [-6.5, 1.2], [-2.2, 1.2], [2.2, 1.2], [6.5, 1.2]];
const PED_TOP = 1.24;
const FRAME_STYLE = {
  museum: { frame: '#c9a24a', metal: 0.8, rough: 0.3, glow: 0.9 },
  neon: { frame: '#0b0b14', metal: 0.2, rough: 0.4, glow: 0.75 },
  disco: { frame: '#f5f5f5', metal: 0.9, rough: 0.15, glow: 0.7 },
  sunset: { frame: '#7a4a2a', metal: 0.1, rough: 0.6, glow: 0.55 },
  stars: { frame: '#c8d0dc', metal: 0.9, rough: 0.25, glow: 0.65 },
  dark: { frame: '#3a3030', metal: 0.3, rough: 0.6, glow: 0.0 },
};

/** Vị trí trưng bày: 8 bệ (ảnh mới nhất) rồi tới tường (tầng dưới trước). */
function slots() {
  const peds = PEDESTALS.map(([x, z], i) => ({ x, z, y: 0, ry: 0, pedestal: i }));
  const wall = [];
  const add = (x, z, ry) => { for (const y of [1.9, 3.75]) wall.push({ x, y, z, ry }); };
  for (let i = 0; i < 7; i++) add(-9 + i * 3, -D / 2 + 0.06, 0);                 // tường sau
  for (let i = 0; i < 5; i++) add(-W / 2 + 0.06, -6.4 + i * 3.2, Math.PI / 2);   // tường trái
  for (let i = 0; i < 5; i++) add(W / 2 - 0.06, -6.4 + i * 3.2, -Math.PI / 2);   // tường phải
  for (const x of [-8, -5, 5, 8]) add(x, D / 2 - 0.06, Math.PI);                  // tường cửa vào (2 bên cửa)
  return [...peds, ...wall.sort((a, b) => a.y - b.y)];
}

// Hình khối dùng chung cho mọi bệ (vẽ 1 lần, không nhân bản bộ nhớ)
const G = {
  base: new RoundedBoxGeometry(1.05, 0.14, 1.05, 2, 0.04),
  column: new THREE.CylinderGeometry(0.3, 0.36, 0.92, 28),
  capital: new RoundedBoxGeometry(0.92, 0.1, 0.92, 2, 0.03),
  ring: new THREE.TorusGeometry(0.4, 0.022, 8, 40),
  plate: new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32),
  rod: new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8),
  floorGlow: new THREE.RingGeometry(0.62, 0.9, 40),
  cone: new THREE.CylinderGeometry(0.1, 0.95, H - PED_TOP - 0.3, 24, 1, true),
};
for (const g of Object.values(G)) g.userData.shared = true;

export class GalleryView extends RoomView {
  constructor(engine) {
    super(engine, 'gallery');
    this.slots = slots();
    this.frames = [];
    this.light = 'museum';
    this.texCache = new Map();
    this.onFrameClick = null;
    this.lastSent = { t: 0, x: 0, z: 0, rot: 0, moving: false };
    this.rig = new OrbitRig({ dist: 4.6, minDist: 2.2, maxDist: 10, pitch: 0.38, minPitch: 0.05, maxPitch: 1.2, height: 1.5 });
    this.build();
  }

  build() {
    const s = this.scene;
    this.shell = roomShell({ w: W, d: D, h: H, floor: '#7a5538', wall: '#d9d0c4' });
    s.add(this.shell);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat('#15100d'));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H;
    s.add(ceiling);
    this.ceiling = ceiling;
    this.rects = [];
    this.circles = [];

    // Tường thứ 4 (phía cửa vào) – giờ camera xoay được nên cần kín 4 phía
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.shell.children[1].material);
    front.rotation.y = Math.PI; front.position.set(0, H / 2, D / 2); front.receiveShadow = true;
    s.add(front);
    const doorFrame = new THREE.Mesh(new RoundedBoxGeometry(2.4, 3.2, 0.2, 2, 0.05), mat('#3a2418'));
    doorFrame.position.set(0, 1.6, D / 2 - 0.05);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.9), new THREE.MeshBasicMaterial({ color: '#ffe2b0' }));
    doorway.rotation.y = Math.PI; doorway.position.set(0, 1.45, D / 2 - 0.16);
    s.add(doorFrame, doorway);

    // Bệ trưng bày
    const marble = new THREE.MeshStandardMaterial({ color: '#efe9df', roughness: 0.22, metalness: 0.05 });
    const dark = mat('#2b2622', { roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d8b04a', metalness: 0.85, roughness: 0.25, emissive: '#3a2a08' });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.coneMat = new THREE.MeshBasicMaterial({ map: coneTexture(), color: '#ffd9a0', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.pedestals = PEDESTALS.map(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const add = (geo, m, y, opts = {}) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = opts.shadow ?? true; o.receiveShadow = true; g.add(o); return o; };
      add(G.base, dark, 0.07);
      add(G.column, marble, 0.14 + 0.46);
      add(G.capital, marble, 1.11);
      add(G.ring, gold, 1.165).rotation.x = Math.PI / 2;
      const plate = add(G.plate, dark, PED_TOP - 0.025);
      const glow = add(G.floorGlow, this.glowMat, 0.012, { shadow: false }); glow.rotation.x = -Math.PI / 2;
      const cone = add(G.cone, this.coneMat, PED_TOP + 0.15 + (H - PED_TOP - 0.3) / 2, { shadow: false });
      cone.receiveShadow = false;
      s.add(g);
      this.circles.push({ x, z, r: 0.62 });
      return { group: g, plate, cone, spin: new THREE.Group() };
    });
    for (const p of this.pedestals) { p.spin.position.y = PED_TOP; p.group.add(p.spin); }

    // Băng ghế ngắm tranh
    const bench = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.45, 0.7, 2, 0.08), mat('#2a2a30', { roughness: 0.4 }));
    bench.position.set(0, 0.23, -1.4); bench.castShadow = true; s.add(bench);
    this.rects.push({ x: -1.2, z: -1.75, w: 2.4, d: 0.7 });

    // Đèn chung (cường độ thay theo chế độ)
    this.hemi = new THREE.HemisphereLight('#ffe7c4', '#1a120c', 0.6);
    this.key = new THREE.DirectionalLight('#ffd7a0', 0.8);
    this.key.position.set(-6, 10, 6); this.key.castShadow = Q.shadows; this.key.shadow.mapSize.setScalar(Math.min(2048, Q.shadowSize));
    Object.assign(this.key.shadow.camera, { left: -13, right: 13, top: 12, bottom: -12 }); this.key.shadow.normalBias = 0.03;
    s.add(this.hemi, this.key);

    // Disco: quả cầu gương + đèn màu xoay
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 3), new THREE.MeshStandardMaterial({ color: '#dddddd', metalness: 1, roughness: 0.12, flatShading: true }));
    this.ball.position.set(0, H - 1.0, -0.8);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5), mat('#888'));
    string.position.set(0, H - 0.25, -0.8);
    this.discoGroup = new THREE.Group();
    this.discoGroup.add(this.ball, string);
    this.discoSpots = ['#ff2d95', '#00d2ff', '#ffe600', '#7dff50'].slice(0, Q.extraLights ? 4 : 2).map((c) => {
      const sp = new THREE.SpotLight(c, 0, 25, 0.35, 0.4, 1);
      sp.position.set(0, H - 1.1, -0.8);
      this.discoGroup.add(sp, sp.target);
      return sp;
    });
    s.add(this.discoGroup);
    this.neonLights = ['#ff3df2', '#3dd5ff', '#8a5bff'].slice(0, Q.extraLights ? 3 : 2).map((c) => { const l = new THREE.PointLight(c, 0, 14, 1.4); s.add(l); return l; });
    this.sunset = new THREE.DirectionalLight('#ff9a4a', 0);
    this.sunset.position.set(12, 4, 3); this.sunset.castShadow = Q.shadows; this.sunset.shadow.mapSize.setScalar(Math.min(1024, Q.shadowSize));
    Object.assign(this.sunset.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8 });
    s.add(this.sunset, this.sunset.target);
    // Sao đêm trên trần
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 900; i++) pts.push((Math.random() - 0.5) * W, H - 0.05 - Math.random() * 0.05, (Math.random() - 0.5) * D);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0.9 }));
    s.add(this.stars);
    this.shooting = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
    this.shooting.rotation.x = Math.PI / 2; this.shooting.position.y = H - 0.1;
    s.add(this.shooting);
    // Đèn pin
    this.torch = new THREE.SpotLight('#fff2d0', 0, 16, 0.3, 0.5, 1);
    this.torch.castShadow = Q.shadows;
    s.add(this.torch, this.torch.target);
    this.torchAim = new THREE.Vector3(0, 2, -D / 2);

    // Đi bộ
    this.ctrl = new Controller({ bounds: { x0: -W / 2 + 0.3, z0: -D / 2 + 0.3, x1: W / 2 - 0.3, z1: D / 2 - 0.3 }, rects: this.rects, circles: this.circles, speed: 4 });
    this.ctrl.onKey = (code) => {
      if (code === 'Equal' || code === 'NumpadAdd') this.rig.zoom(-1);
      if (code === 'Minus' || code === 'NumpadSubtract') this.rig.zoom(1);
    };

    // Chuột/chạm: kéo = xoay camera; chạm ảnh = xem lớn; chạm sàn = đi tới
    const cv = this.engine.canvas;
    this.rig.onTap = (e) => {
      const pics = this.pickables();
      const hit = this.engine.pick(e.clientX, e.clientY, [...pics, this.shell.children[0]], false)[0];
      if (!hit) return;
      const f = hit.object.userData.frame;
      if (f) this.onFrameClick?.(f.index);
      else this.ctrl.goTo(hit.point.x, hit.point.z);
    };
    let hoverAt = 0;
    this._pm = (e) => {
      if (this.rig.dragging || performance.now() - hoverAt < 50) return; // hạn chế raycast mỗi lần di chuột
      hoverAt = performance.now();
      const pics = this.pickables();
      const hit = this.engine.pick(e.clientX, e.clientY, [...pics, ...this.shell.children], false)[0];
      if (hit) this.torchAim.copy(hit.point);
      cv.style.cursor = hit?.object.userData.frame ? 'zoom-in' : '';
    };
    this.onActivate = () => {
      this.rig.attach(cv);
      cv.addEventListener('pointermove', this._pm);
      this.ctrl.pos = { x: 0, z: D / 2 - 4.6 }; this.ctrl.angle = Math.PI;
      this.rig.yaw = this.rig.sYaw = 0;
      const me = this.members.get(store.selfId);
      if (me) { me.av.root.rotation.y = Math.PI; me.av.faceTo(Math.PI); } // quay lưng về camera, nhìn vào phòng
      this.ctrl.setEnabled(true);
      this.sendPos(true);
    };
    this.onDeactivate = () => {
      this.rig.detach();
      cv.removeEventListener('pointermove', this._pm); cv.style.cursor = '';
      this.ctrl.setEnabled(false);
    };
    cheapen(s);
    this.floorMat = this.shell.children[0].material;
    this.wallMat = this.shell.children[1].material;
    this.setLight('museum');
  }

  pickables() { return this._pick ||= this.frames.flatMap((f) => f.pics); }

  // Ở phòng tranh mọi người tự đi lại: vị trí lấy từ snapshot server (đơn vị px)
  placeAll() {
    for (const [id, m] of this.members) {
      m.av.sitting = false;
      if (id === store.selfId) continue;
      const p = store.players.get(id);
      if (p) { m.av.root.position.set(p.x / PX, 0, p.y / PX); m.av.root.rotation.y = p.rot || 0; }
    }
  }

  sendPos(force) {
    const c = this.ctrl, ls = this.lastSent, now = performance.now();
    if (!force && now - ls.t < 66) return;
    const x = Math.round(c.pos.x * PX), z = Math.round(c.pos.z * PX), rot = Math.round(c.angle * 100) / 100;
    if (!force && x === ls.x && z === ls.z && rot === ls.rot && c.moving === ls.moving) return;
    socket.emit('world:move', { x, y: z, rot, moving: c.moving, dir: 'down' });
    Object.assign(ls, { t: now, x, z, rot, moving: c.moving });
  }

  // ---------------- Ảnh: tải + thu nhỏ trước khi lên GPU ----------------
  loadTexture(p, picMat) {
    let entry = this.texCache.get(p.url);
    if (!entry) {
      entry = { tex: null, waiters: [] };
      this.texCache.set(p.url, entry);
      (async () => {
        const blob = await (await fetch(p.url)).blob();
        const img = typeof createImageBitmap === 'function' ? await createImageBitmap(blob) : await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(blob); });
        const k = Math.min(1, TEX_EDGE / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        img.close?.();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Q.level === 'low' ? 1 : 4;
        entry.tex = tex;
        for (const m of entry.waiters) applyTex(m, tex);
        entry.waiters = [];
      })().catch(() => { /* ảnh lỗi → giữ khung trống */ });
    }
    if (entry.tex) applyTex(picMat, entry.tex); else entry.waiters.push(picMat);
  }

  setPhotos(photos) {
    // Chỉ dựng lại khi danh sách ảnh đổi (thả tim không cần dựng lại)
    const list = photos.slice(0, this.slots.length);
    const key = list.map((p) => p.id).join(',');
    if (key === this.photoKey) return;
    this.photoKey = key;
    const keep = new Set(list.map((p) => p.url));
    for (const [url, e] of this.texCache) if (!keep.has(url)) { e.tex?.dispose(); this.texCache.delete(url); }
    for (const f of this.frames) {
      f.group.removeFromParent();
      f.group.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
      f.picMat.dispose(); f.frameMat.dispose(); f.beam?.material.dispose();
    }
    this.frames = [];
    this._pick = null;
    const st = FRAME_STYLE[this.light];
    list.forEach((p, index) => {
      const slot = this.slots[index];
      const onPed = slot.pedestal !== undefined;
      const ar = p.w / p.h;
      const maxW = onPed ? 1.25 : 1.9, maxH = onPed ? 1.05 : 1.45;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      const g = new THREE.Group();
      const picMat = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6 });
      picMat.userData.glow = st.glow;
      this.loadTexture(p, picMat);
      const frameMat = new THREE.MeshStandardMaterial({ color: st.frame, metalness: st.metal, roughness: st.rough, emissive: '#000000' });
      const frame = new THREE.Mesh(new RoundedBoxGeometry(w + 0.2, h + 0.2, 0.08, 2, 0.03), frameMat);
      frame.castShadow = true;
      const picGeo = new THREE.PlaneGeometry(w, h);
      const pics = [new THREE.Mesh(picGeo, picMat)];
      pics[0].position.z = 0.045;
      const f = { group: g, pics, picMat, frameMat, index, onPed, center: new THREE.Vector3() };
      g.add(frame, pics[0]);
      if (onPed) {
        // mặt sau cũng có ảnh, gắn lên mâm xoay của bệ
        const back = new THREE.Mesh(picGeo, picMat);
        back.position.z = -0.045; back.rotation.y = Math.PI;
        pics.push(back); g.add(back);
        const rod = new THREE.Mesh(G.rod, mat('#d8b04a', { metalness: 0.8, roughness: 0.3 }));
        rod.position.y = -h / 2 - 0.1 - 0.05;
        g.add(rod);
        g.position.y = 0.25 + h / 2;
        const ped = this.pedestals[slot.pedestal];
        ped.spin.add(g);
        f.spin = ped.spin;
        f.center.set(slot.x, PED_TOP + g.position.y, slot.z);
      } else {
        g.position.set(slot.x, slot.y, slot.z); g.rotation.y = slot.ry;
        // vệt sáng đèn rọi trên tường (giả lập, rẻ hơn spotlight thật)
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.2, h + 1.6), new THREE.MeshBasicMaterial({
          map: beamTexture(), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd9a0',
        }));
        beam.position.set(0, 0.25, 0.01);
        const lampHead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.18, 12), mat('#1a1a1f', { metalness: 0.7, roughness: 0.3 }));
        lampHead.rotation.x = Math.PI / 2.6; lampHead.position.set(0, h / 2 + 0.45, 0.25);
        g.add(beam, lampHead);
        f.beam = beam;
        this.scene.add(g);
        f.center.set(slot.x, slot.y, slot.z);
      }
      for (const m of pics) m.userData.frame = f;
      this.frames.push(f);
    });
    for (const [i, ped] of this.pedestals.entries()) ped.cone.visible = ped.hasPhoto = this.frames.some((f) => f.spin === ped.spin) && i >= 0;
    this.applyLight();
  }

  setLight(light) { this.light = light; this.applyLight(); }

  applyLight() {
    const L = this.light, st = FRAME_STYLE[L];
    this.hemi.intensity = { museum: 1.1, neon: 0.3, disco: 0.25, sunset: 0.8, stars: 0.35, dark: 0.03 }[L];
    this.hemi.color.set({ museum: '#ffe7c4', neon: '#9b7bff', disco: '#ffffff', sunset: '#ffb08a', stars: '#7d8cff', dark: '#ffffff' }[L]);
    this.hemi.groundColor.set({ sunset: '#3a1f4a', stars: '#05061a' }[L] || '#1a120c');
    this.key.intensity = { museum: 1.0, neon: 0, disco: 0, sunset: 0.25, stars: 0.08, dark: 0 }[L];
    this.sunset.intensity = L === 'sunset' ? 3.2 : 0;
    this.discoGroup.visible = L === 'disco';
    for (const sp of this.discoSpots) sp.intensity = L === 'disco' ? 90 : 0;
    for (const l of this.neonLights) l.intensity = L === 'neon' ? 18 : 0;
    this.stars.visible = this.shooting.visible = L === 'stars';
    this.ceiling.material = mat(L === 'stars' ? '#070a20' : '#15100d');
    this.torch.intensity = L === 'dark' ? 60 : 0;
    this.wallMat.color.set({ museum: '#f2e2cc', neon: '#4a3a88', disco: '#5a5a66', sunset: '#ffb08a', stars: '#3a4a8a', dark: '#888888' }[L]);
    if ('roughness' in this.floorMat) this.floorMat.roughness = L === 'neon' || L === 'disco' ? 0.25 : 0.65;
    this.scene.background = new THREE.Color({ museum: '#120c08', neon: '#07041a', disco: '#06030a', sunset: '#2a1424', stars: '#03051a', dark: '#000000' }[L]);
    this.scene.fog = new THREE.Fog(this.scene.background, 16, 38);
    // bệ: luồng sáng rọi + vòng sáng dưới chân
    this.coneMat.opacity = { museum: 0.3, stars: 0.18, sunset: 0.12, neon: 0, disco: 0, dark: 0 }[L];
    this.coneMat.color.set(L === 'stars' ? '#a8c4ff' : '#ffd9a0');
    this.glowMat.opacity = { museum: 0.35, neon: 0.9, disco: 0.8, sunset: 0.25, stars: 0.5, dark: 0 }[L];
    this.glowMat.color.set({ museum: '#ffcf7a', stars: '#8fb4ff', sunset: '#ff9a5a' }[L] || '#ffffff');
    for (const f of this.frames) {
      f.frameMat.color.set(st.frame); f.frameMat.metalness = st.metal; f.frameMat.roughness = st.rough;
      f.frameMat.emissive.set('#000'); f.frameMat.emissiveIntensity = 1;
      f.picMat.userData.glow = st.glow;
      if (f.picMat.emissiveMap) f.picMat.emissiveIntensity = st.glow;
      if (f.beam) {
        f.beam.material.opacity = L === 'museum' ? 0.55 : L === 'stars' ? 0.18 : 0;
        f.beam.material.color.set(L === 'stars' ? '#a8c4ff' : '#ffd9a0');
      }
    }
  }

  // ---------------- Vòng lặp ----------------
  onUpdate(dt, t) {
    const c = this.ctrl;
    c.update(dt, this.rig.sYaw);
    const me = this.members.get(store.selfId);
    if (me) {
      me.av.moving = c.moving;
      if (c.moving) me.av.faceTo(c.angle);
      me.av.root.position.set(c.pos.x, 0, c.pos.z);
    }
    this.sendPos(false);
    // người khác: nội suy theo snapshot
    const a = Math.min(1, dt * 10);
    for (const [id, m] of this.members) {
      if (id === store.selfId) continue;
      const p = store.players.get(id);
      if (!p) continue;
      const pos = m.av.root.position, tx = p.x / PX, tz = p.y / PX;
      if (Math.abs(tx - pos.x) > 6 || Math.abs(tz - pos.z) > 6) pos.set(tx, 0, tz);
      else { pos.x += (tx - pos.x) * a; pos.z += (tz - pos.z) * a; }
      m.av.moving = !!p.moving; m.av.faceTo(p.rot || 0);
    }
    // camera xoay quanh mình, không cho xuyên tường
    this.rig.update(dt, c.pos.x, c.pos.z, this.camera, (p) => Math.abs(p.x) < W / 2 - 0.25 && Math.abs(p.z) < D / 2 - 0.25 && p.y < H - 0.25);

    // bệ xoay chậm
    for (const [i, ped] of this.pedestals.entries()) if (ped.hasPhoto) ped.spin.rotation.y = t * 0.35 + i * 0.8;

    const L = this.light;
    if (L === 'disco') {
      this.ball.rotation.y = t * 0.8;
      this.discoSpots.forEach((sp, i) => {
        const ang = t * 0.9 + (i * Math.PI) / 2;
        sp.target.position.set(Math.cos(ang) * 8, 0.5 + Math.sin(t * 1.3 + i) * 2, Math.sin(ang) * 6);
      });
      this.frames.forEach((f, i) => f.frameMat.emissive.setHSL(((t * 0.5 + i * 0.25) % 1), 1, 0.35));
      this.glowMat.color.setHSL((t * 0.3) % 1, 1, 0.55);
    } else if (L === 'neon') {
      this.neonLights.forEach((l, i) => l.position.set(Math.sin(t * 0.5 + i * 2.1) * 8, 2.5 + Math.sin(t + i) * 0.8, Math.cos(t * 0.4 + i * 2.1) * 6));
      this.frames.forEach((f, i) => { f.frameMat.emissive.setHSL(((i * 0.19 + t * 0.08) % 1), 1, 0.5); f.frameMat.emissiveIntensity = 1.6 + (Math.sin(t * 9 + i * 3) > 0.97 ? -1.2 : 0); });
      this.glowMat.color.setHSL((0.8 + Math.sin(t * 0.5) * 0.1) % 1, 1, 0.55);
    } else if (L === 'stars') {
      this.stars.material.opacity = 0.7 + Math.sin(t * 2) * 0.2;
      const p = (t % 7) / 7;
      this.shooting.material.opacity = p > 0.82 ? Math.sin(((p - 0.82) / 0.18) * Math.PI) : 0;
      this.shooting.position.set(-8 + p * 16, H - 0.1, -6 + p * 6);
    } else if (L === 'sunset') {
      this.sunset.intensity = 3 + Math.sin(t * 0.6) * 0.4;
    } else if (L === 'dark') {
      this.torch.position.set(c.pos.x, 1.9, c.pos.z + 0.2);
      this.torch.target.position.lerp(this.torchAim, Math.min(1, dt * 12));
      for (const f of this.frames) if (f.picMat.emissiveMap) f.picMat.emissiveIntensity = Math.max(0, 1.2 - f.center.distanceTo(this.torch.target.position) * 0.9) * 0.8;
    }
  }
}

function applyTex(m, tex) {
  m.map = tex; m.emissiveMap = tex; m.color.set('#ffffff');
  m.emissiveIntensity = m.userData.glow ?? 0.8; // độ sáng theo chế độ đèn hiện tại
  m.needsUpdate = true;
}

let _beam = null;
function beamTexture() {
  if (_beam) return _beam;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 30, 10, 128, 120, 150);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  _beam = new THREE.CanvasTexture(cv);
  return _beam;
}
let _cone = null;
function coneTexture() {
  if (_cone) return _cone;
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(0.6, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
  c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  _cone = new THREE.CanvasTexture(cv);
  return _cone;
}
