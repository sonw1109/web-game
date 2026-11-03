// Camera xoay quanh nhân vật như game góc nhìn thứ 3:
// kéo chuột / vuốt 1 ngón = xoay, lăn chuột / chụm 2 ngón = zoom, chạm/click (không kéo) = onTap.
import * as THREE from 'three';

const TAP_PX = 7;

export class OrbitRig {
  /** @param {{dist:number,minDist:number,maxDist:number,pitch?:number,minPitch?:number,maxPitch?:number,height?:number}} o */
  constructor(o) {
    this.yaw = 0;                       // 0 = camera ở phía +z, nhìn về −z
    this.pitch = o.pitch ?? 0.62;       // góc ngẩng (radian)
    this.dist = o.dist;
    this.minDist = o.minDist; this.maxDist = o.maxDist;
    this.minPitch = o.minPitch ?? 0.12; this.maxPitch = o.maxPitch ?? 1.25;
    this.height = o.height ?? 1.0;      // điểm nhìn cao hơn chân nhân vật
    this.sYaw = this.yaw; this.sPitch = this.pitch; this.sDist = this.dist; // giá trị làm mượt
    this.target = new THREE.Vector3();
    this.onTap = null;                  // (event) => void
    this.onRotate = null;
    this.pointers = new Map();
    this.drag = null;
    this._bind();
  }

  _bind() {
    this._down = (e) => {
      if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse' && e.button !== 2) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) this.drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, e };
      else { this.drag = null; this.pinch = this.pinchDist(); }
      this.el.setPointerCapture?.(e.pointerId);
    };
    this._move = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2 && this.pinch) {
        const d = this.pinchDist();
        this.dist = THREE.MathUtils.clamp(this.dist * (this.pinch / d), this.minDist, this.maxDist);
        this.pinch = d;
        return;
      }
      const g = this.drag;
      if (!g) return;
      if (!g.moved && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TAP_PX) g.moved = true;
      if (g.moved) {
        const k = e.pointerType === 'touch' ? 0.009 : 0.006;
        this.yaw -= (e.clientX - g.x) * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - g.y) * k * 0.7, this.minPitch, this.maxPitch);
        this.onRotate?.();
      }
      g.x = e.clientX; g.y = e.clientY;
    };
    this._up = (e) => {
      const g = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      // chỉ chuột trái / chạm mới là "bấm để đi"; chuột phải dùng để xoay
      if (g && !g.moved && this.pointers.size === 0 && e.button !== 2) this.onTap?.(e);
      if (this.pointers.size === 0) this.drag = null;
    };
    // chạm bị hủy (hệ thống chen ngang, cuộn trang…) → không coi là bấm
    this._cancel = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.drag = null;
    };
    this._wheel = (e) => { e.preventDefault(); this.zoom(Math.sign(e.deltaY) * this.dist * 0.12); };
    this._ctx = (e) => e.preventDefault(); // chuột phải cũng xoay được
  }

  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); }
  zoom(d) { this.dist = THREE.MathUtils.clamp(this.dist + d, this.minDist, this.maxDist); }

  attach(el) {
    this.el = el;
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._cancel);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.addEventListener('contextmenu', this._ctx);
  }
  detach() {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('pointerdown', this._down);
    el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerup', this._up);
    el.removeEventListener('pointercancel', this._cancel);
    el.removeEventListener('wheel', this._wheel);
    el.removeEventListener('contextmenu', this._ctx);
    this.pointers.clear(); this.drag = null; this.pinch = null;
    this.el = null;
  }

  get dragging() { return !!this.drag?.moved; }

  /** Đặt camera nhìn vào (x, z). fit(pos) có thể kéo camera lại gần nếu vướng tường. */
  update(dt, x, z, camera, fit) {
    const a = Math.min(1, dt * 10);
    // xoay theo đường ngắn nhất
    let dy = this.yaw - this.sYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.sYaw += dy * a;
    this.sPitch += (this.pitch - this.sPitch) * a;
    this.sDist += (this.dist - this.sDist) * Math.min(1, dt * 6);
    this.target.lerp((this._want ||= new THREE.Vector3()).set(x, this.height, z), Math.min(1, dt * 12));
    // Kéo xuống dưới tầm ngang (pitch < LOW) → camera hạ sát đất phía sau và NGƯỚC LÊN trời
    const LOW = 0.08;
    const pitch = Math.max(this.sPitch, LOW);
    let d = this.sDist;
    const pos = (this._pos ||= new THREE.Vector3());
    for (let i = 0; i < 8; i++) {
      const cp = Math.cos(pitch);
      pos.set(this.target.x + Math.sin(this.sYaw) * cp * d, this.target.y + Math.sin(pitch) * d, this.target.z + Math.cos(this.sYaw) * cp * d);
      if (!fit || fit(pos)) break;
      d *= 0.8;
    }
    camera.position.copy(pos);
    const look = this._look || (this._look = new THREE.Vector3());
    look.copy(this.target);
    if (this.sPitch < LOW) look.y += (LOW - this.sPitch) * Math.max(6, d) * 1.8; // nâng dần lên trời (tối đa ~50°, vẫn thấy chân trời)
    camera.lookAt(look);
  }
}
