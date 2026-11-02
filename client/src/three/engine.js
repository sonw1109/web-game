// Bộ máy 3D dùng chung: 1 renderer WebGL + 1 lớp CSS3D (để nhúng YouTube vào màn chiếu 3D).
// Mỗi "view" (sảnh, từng phòng) có scene + camera riêng; engine chỉ vẽ view đang hoạt động.
import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { Q } from './quality.js';

const REF_ASPECT = 1.25; // màn dọc: nới góc nhìn để vẫn thấy đủ cảnh như màn ngang

export class Engine {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: Q.antialias, alpha: true, powerPreference: 'high-performance', stencil: false }));
    this.maxPR = Math.min(window.devicePixelRatio || 1, Q.maxPR);
    // máy yếu: khởi đầu ở giữa khoảng cho đỡ giật mấy giây đầu
    this.pr = Q.level === 'low' ? Math.max(Q.minPR, (this.maxPR + Q.minPR) / 2) : this.maxPR;
    r.setPixelRatio(this.pr);
    r.shadowMap.enabled = Q.shadows;
    r.shadowMap.type = Q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = Q.cheapMaterials ? 1.15 : 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 1);

    // Lớp CSS3D nằm DƯỚI canvas WebGL; chỗ nào cần lộ ra (màn chiếu) thì WebGL "đục lỗ" alpha = 0
    this.css = new CSS3DRenderer();
    Object.assign(this.css.domElement.style, { position: 'absolute', inset: '0', zIndex: '0' });
    Object.assign(r.domElement.style, { position: 'absolute', inset: '0', zIndex: '1', touchAction: 'none' });
    container.append(this.css.domElement, r.domElement);

    this.view = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this.frameAvg = 16.7;
    this.lastAdjust = 0;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 200));
    // Điện thoại hay "mất" WebGL khi chuyển app → tải lại cho chắc
    r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; document.body.classList.add('gl-lost'); });
    r.domElement.addEventListener('webglcontextrestored', () => location.reload());
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  get canvas() { return this.renderer.domElement; }
  get size() { return { w: this.container.clientWidth || window.innerWidth, h: this.container.clientHeight || window.innerHeight }; }

  fitCamera(cam, w, h) {
    cam.userData.baseFov ??= cam.fov;
    const aspect = w / h;
    cam.aspect = aspect;
    if (aspect < REF_ASPECT) {
      const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.userData.baseFov) / 2) * REF_ASPECT);
      cam.fov = Math.min(88, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hFov / 2) / aspect)));
    } else cam.fov = cam.userData.baseFov;
    cam.updateProjectionMatrix();
  }

  resize() {
    const { w, h } = this.size;
    this.renderer.setSize(w, h);
    this.css.setSize(w, h);
    if (this.view) { this.fitCamera(this.view.camera, w, h); this.view.onResize?.(w, h); }
  }

  /** Chuyển sang view khác (sảnh ↔ phòng). */
  setView(view) {
    if (this.view === view) return;
    this.view?.deactivate?.();
    this.view = view;
    this.resize();
    view.activate?.();
  }

  /** Độ phân giải động: tụt FPS thì hạ, ổn định thì nâng dần. */
  adapt(ms, now) {
    this.frameAvg = this.frameAvg * 0.95 + ms * 0.05;
    if (now - this.lastAdjust < (this.frameAvg > 40 ? 1000 : 2000)) return;
    let pr = this.pr;
    if (this.frameAvg > 24 && pr > Q.minPR) pr = Math.max(Q.minPR, pr - (this.frameAvg > 40 ? 0.3 : 0.15)); // rất giật → hạ nhanh hơn
    else if (this.frameAvg < 17.5 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + 0.1);
    if (pr !== this.pr) {
      this.pr = pr;
      this.renderer.setPixelRatio(pr);
      this.resize();
      this.lastAdjust = now;
      this.frameAvg = 16.7;
    }
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const v = this.view;
    // Không vẽ khi tab ẩn / đang ở màn khác → đỡ tốn pin
    if (!v || this.lost || document.hidden || this.container.hidden) return;
    const t = this.clock.elapsedTime, start = performance.now();
    v.update?.(dt, t);
    this.renderer.render(v.scene, v.camera);
    if (v.cssScene) this.css.render(v.cssScene, v.camera);
    v.afterRender?.();
    if (this._capture) { // chụp ngay sau khi vẽ (trước khi trình duyệt xóa bộ đệm)
      const c = document.createElement('canvas');
      c.width = this.canvas.width; c.height = this.canvas.height;
      c.getContext('2d').drawImage(this.canvas, 0, 0);
      this._capture(c); this._capture = null;
    }
    this.adapt(dt * 1000, start);
  }

  /** Chụp khung hình kế tiếp → Promise<canvas>. */
  capture() { return new Promise((r) => { this._capture = r; }); }

  /** Chiếu điểm 3D ra tọa độ màn hình (px). visible = false nếu ở sau camera. */
  project(pos, camera = this.view?.camera) {
    const v = this._v.copy(pos).project(camera);
    const { w, h } = this.size;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  }

  /** Raycast từ vị trí chuột/chạm vào danh sách object. */
  pick(clientX, clientY, objects, recursive = true) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }
}

/** Máy yếu: đổi vật liệu PBR (Standard) sang Lambert rẻ hơn nhiều, giữ màu/texture/phát sáng. */
const lambertCache = new WeakMap();
export function cheapen(root) {
  if (!Q.cheapMaterials) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial || o.userData.keepMaterial) return;
    const m = o.material;
    if (!lambertCache.has(m)) {
      lambertCache.set(m, new THREE.MeshLambertMaterial({
        color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
        transparent: m.transparent, opacity: m.opacity, side: m.side, flatShading: m.flatShading,
        vertexColors: m.vertexColors, depthWrite: m.depthWrite, blending: m.blending,
      }));
    }
    o.material = lambertCache.get(m);
  });
}
