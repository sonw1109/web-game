// Nền chung cho các phòng 3D: thành viên trong phòng được xếp vào chỗ ngồi/đứng,
// có tên + bong bóng chat trên đầu, camera khẽ lắc theo chuột cho có chiều sâu.
import * as THREE from 'three';
import { EMOTES } from './expressions.js';
import { store } from '../store.js';
import { Avatar } from './avatar.js';
import { Labels } from '../ui/labels.js';

export class RoomView {
  /** @param {import('./engine.js').Engine} engine */
  constructor(engine, roomId) {
    this.engine = engine;
    this.roomId = roomId;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
    this.camPos = new THREE.Vector3(0, 3, 8);
    this.camLook = new THREE.Vector3(0, 1.5, 0);
    this.parallax = 0.35;
    this.mouse = new THREE.Vector2();
    /** @type {Array<{x:number,z:number,y?:number,rot?:number,sit?:boolean}>} */
    this.seats = [];
    this.members = new Map(); // id -> { av, seat }
    this.labels = new Labels(document.getElementById('room-labels'));
    this.active = false;
    this._onMove = (e) => this.mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
  }

  // ---- Chỗ ngồi: mình ưu tiên chỗ 0 (gần camera), người khác lấp chỗ trống ----
  seatFor(id, taken) {
    if (id === store.selfId && !taken.has(0)) return 0;
    for (let i = id === store.selfId ? 0 : 1; i < this.seats.length; i++) if (!taken.has(i)) return i;
    return -1; // hết chỗ → đứng phía sau
  }
  overflowSpot(n) { return { x: -3 + (n % 7), z: 6 + Math.floor(n / 7) * 0.9, rot: Math.PI, sit: false }; }

  syncMembers() {
    const ids = new Set(store.inRoom(this.roomId).map((p) => p.id));
    if (store.selfId) ids.add(store.selfId);
    for (const [id, m] of this.members) if (!ids.has(id)) { m.av.dispose(); this.labels.remove(id); this.members.delete(id); }
    for (const id of ids) {
      if (this.members.has(id)) continue;
      const p = store.players.get(id);
      if (!p) continue;
      const av = new Avatar(p.appearance);
      this.scene.add(av.root);
      this.members.set(id, { av, seat: -2 });
      this.labels.add(id, store.displayName(p), id === store.selfId);
    }
    this.placeAll();
  }

  /** Xếp chỗ (gọi lại khi vai trò thay đổi, vd. ai ngồi ghế X/O). */
  placeAll() {
    const taken = new Set();
    const order = [...this.members.keys()].sort((a, b) => (a === store.selfId ? -1 : b === store.selfId ? 1 : 0));
    let overflow = 0;
    // giữ chỗ cũ nếu còn hợp lệ
    for (const id of order) {
      const m = this.members.get(id);
      const want = this.seatFor(id, taken);
      m.seat = want;
      if (want >= 0) taken.add(want);
      const s = want >= 0 ? this.seats[want] : this.overflowSpot(overflow++);
      m.av.root.position.set(s.x, s.y ?? 0, s.z);
      m.av.faceTo(s.rot ?? 0);
      m.av.root.rotation.y = s.rot ?? 0;
      m.av.sitting = !!s.sit;
    }
  }

  member(id) { return this.members.get(id); }
  renameLabel(id, name) { this.labels.rename(id, name); }
  bubble(id, text) { if (this.members.has(id)) this.labels.bubble(id, text); }
  emoji(id, e) { if (this.members.has(id)) this.labels.emoji(id, e); }
  emote(id, type) { this.members.get(id)?.av.emote(type); const f = EMOTES[type]?.float; if (f) this.emoji(id, f); }

  activate() {
    this.active = true;
    this.labels.root.hidden = false;
    this.unsub = store.on('players-changed', () => this.syncMembers());
    window.addEventListener('pointermove', this._onMove);
    this.syncMembers();
    this.camera.position.copy(this.camPos);
    this.onActivate?.();
  }

  deactivate() {
    this.active = false;
    this.unsub?.();
    window.removeEventListener('pointermove', this._onMove);
    for (const [id, m] of this.members) { m.av.dispose(); this.labels.remove(id); }
    this.members.clear();
    this.labels.root.hidden = true;
    this.onDeactivate?.();
  }

  update(dt, t) {
    for (const m of this.members.values()) m.av.update(dt, t);
    // camera lắc nhẹ theo chuột
    const want = (this._want ||= new THREE.Vector3()).set(this.mouse.x * this.parallax * 2, -this.mouse.y * this.parallax, 0).add(this.camPos);
    this.camera.position.lerp(want, Math.min(1, dt * 3));
    this.camera.lookAt(this.camLook);
    this.onUpdate?.(dt, t);
  }

  afterRender() {
    const v = (this._tv ||= new THREE.Vector3());
    for (const [id, m] of this.members) {
      const p = this.engine.project(m.av.topPosition(v));
      this.labels.setVisible(id, p.visible); // điểm sau lưng camera chiếu ra vị trí lật ngược → ẩn
      if (p.visible) this.labels.position(id, p.x, p.y);
    }
  }
}
