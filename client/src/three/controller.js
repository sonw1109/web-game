// Điều khiển nhân vật: phím vật lý (WASD/mũi tên – không bị bộ gõ tiếng Việt làm nhiễu),
// click/chạm để đi tới, va chạm với hình chữ nhật & hình tròn.
const isTyping = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

export class Controller {
  /**
   * @param {{bounds:{x0,z0,x1,z1}, rects:Array<{x,z,w,d}>, circles:Array<{x,z,r}>, speed?:number, radius?:number}} world
   */
  constructor(world) {
    this.world = world;
    this.speed = world.speed ?? 5.2;
    this.radius = world.radius ?? 0.28;
    this.pos = { x: 0, z: 0 };
    this.angle = 0;
    this.moving = false;
    this.target = null;
    this.enabled = false;
    this.pressed = new Set();
    this.analog = { x: 0, z: 0 }; // từ joystick ảo (điện thoại)
    this.onKey = null; // (code) => void – phím E, số…

    const ignore = (e) => e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey;
    this._down = (e) => {
      if (!this.enabled || isTyping() || ignore(e)) return;
      this.pressed.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code);
    };
    this._up = (e) => this.pressed.delete(e.code);
    this._clear = () => this.pressed.clear();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._clear);
    document.addEventListener('focusin', this._clear);
  }

  setEnabled(v) { this.enabled = v; if (!v) { this.pressed.clear(); this.target = null; this.moving = false; this.analog = { x: 0, z: 0 }; } }
  goTo(x, z) { this.target = { x, z, stuck: 0 }; }

  blocked(x, z) {
    const r = this.radius, w = this.world, b = w.bounds;
    if (x < b.x0 + r || x > b.x1 - r || z < b.z0 + r || z > b.z1 - r) return true;
    for (const q of w.rects) {
      const cx = Math.max(q.x, Math.min(x, q.x + q.w)), cz = Math.max(q.z, Math.min(z, q.z + q.d));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    for (const c of w.circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true;
    // hình chữ nhật xoay (nhà quay vào quảng trường): đổi điểm sang hệ tọa độ của nhà
    for (const b of w.obbs || []) {
      const dx = x - b.cx, dz = z - b.cz, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const qx = Math.max(-b.w / 2 - 0.15, Math.min(lx, b.w / 2 + 0.15)), qz = Math.max(-b.d / 2 - 0.15, Math.min(lz, b.d / 2 + 0.15));
      if ((lx - qx) ** 2 + (lz - qz) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Trả về true nếu vị trí thay đổi. camYaw: góc camera để W luôn là "đi vào trong màn hình". */
  update(dt, camYaw = 0) {
    if (!this.enabled) { this.moving = false; return false; }
    const k = this.pressed;
    let ix = 0, iz = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) iz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iz += 1;
    const an = this.analog;
    if (!ix && !iz && Math.hypot(an.x, an.z) > 0.15) { ix = an.x; iz = an.z; }
    let vx = 0, vz = 0;
    if (ix || iz) {
      this.target = null;
      const c = Math.cos(camYaw), s = Math.sin(camYaw);
      vx = ix * c + iz * s; vz = -ix * s + iz * c;
    } else if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist < 0.12) this.target = null;
      else { vx = dx / dist * Math.min(1, dist * 3); vz = dz / dist * Math.min(1, dist * 3); }
    }
    const len = Math.hypot(vx, vz);
    this.moving = len > 0.01;
    if (!this.moving) return false;
    if (len > 1) { vx /= len; vz /= len; }
    const step = this.speed * dt;
    const ox = this.pos.x, oz = this.pos.z;
    const nx = ox + vx * step, nz = oz + vz * step;
    if (!this.blocked(nx, oz)) this.pos.x = nx;
    if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
    this.angle = Math.atan2(vx, vz);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (this.target && moved < step * 0.3 && ++this.target.stuck > 15) this.target = null;
    if (moved < 1e-4) { this.moving = !!this.target; return false; }
    return true;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._clear);
    document.removeEventListener('focusin', this._clear);
  }
}
