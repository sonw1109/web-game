// Bản đồ khu phố "Hội Quán" – sinh bằng code (không cần tileset ngoài).
export const TILE = 16;
export const MAP_W = 64;
export const MAP_H = 46;

// Hạt giống random cố định → mọi người thấy cùng bản đồ
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Các tòa nhà (tọa độ theo tile). Cửa ở giữa cạnh dưới. */
export const BUILDINGS = [
  { id: 'cinema', name: 'Rạp phim', icon: '🎬', x: 5, y: 3, w: 10, h: 6, roof: '#c0392b', wall: '#f3e1c7' },
  { id: 'draw', name: 'Phòng Vẽ', icon: '🎨', x: 33, y: 3, w: 9, h: 6, roof: '#8e5cd6', wall: '#e9f0ff' },
  { id: 'quiz', name: 'Phòng Quiz', icon: '❓', x: 6, y: 21, w: 9, h: 6, roof: '#2f80c9', wall: '#fff4d6' },
  { id: 'caro', name: 'Quán Caro', icon: '⭕', x: 33, y: 21, w: 9, h: 6, roof: '#2e9d6a', wall: '#f6e8dc' },
  { id: 'gallery', name: 'Phòng Tranh', icon: '🖼️', x: 19, y: 3, w: 10, h: 6, roof: '#b8860b', wall: '#fbf6ec' },
  { id: 'typing', name: 'Đua Gõ Phím', icon: '⌨️', x: 15, y: 22, w: 7, h: 6, roof: '#e67e22', wall: '#fdf2e9' },
  { id: 'baucua', name: 'Sòng Bầu Cua', icon: '🎲', x: 25, y: 22, w: 7, h: 6, roof: '#b71c1c', wall: '#fff3e0' },
].map((b) => ({ ...b, doorX: b.x + Math.floor(b.w / 2), doorY: b.y + b.h }));

export const SPAWN = { x: 24 * TILE, y: 20 * TILE };
export const FOUNTAIN = { x: 24 * TILE, y: 17 * TILE, r: 22 };
export const POND = { x: 2, y: 11, w: 5, h: 4 };
// Khu mới khi mở rộng bản đồ
export const LAKE = { x: 44, y: 20, w: 14, h: 9 };     // 🎣 hồ câu cá
export const DOCK = { x: 50, y: 25, w: 2, h: 5 };      // bến gỗ đi ra giữa hồ
export const GARDEN = { x: 46, y: 3, w: 16, h: 11 };   // 🌸 vườn hoa đào
export const PARK = { x: 19, y: 35, w: 11, h: 7 };     // 🏯 công viên + chòi nghỉ
export const GAZEBO = { x: 24.5, y: 38.5 };

// ---- Lưới mặt đất ----
// 0 cỏ, 1 đường đá, 2 quảng trường, 3 nước, 4 cỏ vườn đào (có cánh hoa)
function buildGround() {
  const g = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(0));
  const fill = (x, y, w, h, v) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j]?.[i] !== undefined) g[j][i] = v;
  };
  fill(GARDEN.x, GARDEN.y, GARDEN.w, GARDEN.h, 4); // vườn đào
  fill(3, 16, 58, 2, 1);          // đường ngang chính (kéo dài sang khu mới)
  fill(23, 9, 2, 33, 1);          // đường dọc chính: cửa Phòng Tranh → công viên
  fill(6, 30, 55, 2, 1);          // đường ngang dưới
  fill(59, 16, 2, 16, 1);         // đường dọc phía đông (ra hồ câu)
  fill(53, 8, 2, 8, 1);           // lối vào vườn đào
  fill(51, 5, 6, 4, 2);           // sân đá giữa vườn
  fill(18, 12, 12, 10, 2);        // quảng trường
  fill(PARK.x, PARK.y, PARK.w, PARK.h, 2); // sân công viên
  for (const b of BUILDINGS) {
    if (b.y < 15) fill(b.doorX - 1, b.doorY, 2, 16 - b.doorY, 1); // nhà phía trên → nối đường chính
    else fill(b.doorX - 1, b.doorY, 2, 30 - b.doorY, 1);          // nhà phía dưới → nối đường dưới
  }
  fill(POND.x, POND.y, POND.w, POND.h, 3);
  fill(LAKE.x, LAKE.y, LAKE.w, LAKE.h, 3);
  fill(DOCK.x, LAKE.y + LAKE.h, DOCK.w, 30 - LAKE.y - LAKE.h, 1); // lối từ đường dưới ra bến
  return g;
}
export const GROUND = buildGround();

export function isFree(tx, ty) {
  if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return false;
  if (GROUND[ty][tx] !== 0) return false;
  if (Math.hypot(tx + 0.5 - GAZEBO.x, ty + 0.5 - GAZEBO.y) < 3) return false;
  for (const b of BUILDINGS) {
    if (tx >= b.x - 1 && tx <= b.x + b.w && ty >= b.y - 2 && ty <= b.doorY + 1) return false;
  }
  return true;
}

/** Vẽ toàn bộ mặt đất lên 1 canvas. */
export function drawGround() {
  const cv = document.createElement('canvas');
  cv.width = MAP_W * TILE; cv.height = MAP_H * TILE;
  const ctx = cv.getContext('2d');
  const r = rng(42);
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const x = tx * TILE, y = ty * TILE, t = GROUND[ty][tx];
    if (t === 0) {
      px(x, y, TILE, TILE, (tx + ty) % 2 ? '#5fae57' : '#63b35a');
      for (let k = 0; k < 4; k++) px(x + Math.floor(r() * 15), y + Math.floor(r() * 14), 1, 2, '#4f9a4a');
      if (r() < 0.06) {
        const fc = ['#ffe066', '#ff8fab', '#ffffff', '#a5d8ff'][Math.floor(r() * 4)];
        const fx = x + 4 + Math.floor(r() * 8), fy = y + 4 + Math.floor(r() * 8);
        px(fx - 1, fy, 3, 1, fc); px(fx, fy - 1, 1, 3, fc); px(fx, fy, 1, 1, '#f08c00');
      }
    } else if (t === 1) {
      px(x, y, TILE, TILE, '#c9b38f');
      ctx.strokeStyle = '#b39c78'; ctx.lineWidth = 1;
      const off = ty % 2 ? 4 : 0;
      px(x, y + 7, TILE, 1, '#b39c78'); px(x, y + 15, TILE, 1, '#b39c78');
      px(x + off, y, 1, 7, '#b39c78'); px(x + off + 8, y + 8, 1, 7, '#b39c78');
      if (r() < 0.3) px(x + Math.floor(r() * 14), y + Math.floor(r() * 14), 2, 1, '#d8c6a5');
    } else if (t === 2) {
      px(x, y, TILE, TILE, (tx + ty) % 2 ? '#d9c9b0' : '#cfbea3');
      px(x, y, TILE, 1, '#e6d8c2'); px(x, y, 1, TILE, '#e6d8c2');
    } else if (t === 3) {
      px(x, y, TILE, TILE, '#3d8fd6');
      if (r() < 0.5) px(x + Math.floor(r() * 10), y + Math.floor(r() * 14), 4, 1, '#8cc8f5');
    }
  }
  // Bờ hồ
  const P = POND;
  ctx.strokeStyle = '#2c6aa3'; ctx.lineWidth = 2;
  ctx.strokeRect(P.x * TILE + 1, P.y * TILE + 1, P.w * TILE - 2, P.h * TILE - 2);
  return cv;
}

/** Vẽ một tòa nhà thành canvas (mái + tường + cửa sổ + cửa). */
export function drawBuilding(b) {
  const W = b.w * TILE, H = b.h * TILE, roofH = Math.round(H * 0.45);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + 4;
  const ctx = cv.getContext('2d');
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  // tường
  px(0, roofH - 2, W, H - roofH + 2, b.wall);
  for (let y = roofH + 4; y < H; y += 6) px(0, y, W, 1, 'rgba(0,0,0,0.06)');
  px(0, H - 3, W, 3, 'rgba(0,0,0,0.18)');
  // mái
  px(-0, 0, W, roofH, b.roof);
  for (let y = 3; y < roofH; y += 4) for (let x = (y / 4) % 2 ? 0 : 4; x < W; x += 8) px(x, y, 6, 1, 'rgba(0,0,0,0.18)');
  px(0, 0, W, 2, 'rgba(255,255,255,0.25)');
  px(0, roofH - 3, W, 3, 'rgba(0,0,0,0.3)');
  // cửa sổ
  const winY = roofH + 6, winW = 12, winH = 10;
  for (let x = 10; x < W - 10; x += 26) {
    if (Math.abs(x + winW / 2 - W / 2) < 18) continue;
    px(x - 1, winY - 1, winW + 2, winH + 2, '#5a4636');
    px(x, winY, winW, winH, '#ffe8a3');
    px(x, winY, winW, 3, '#fff6d0');
    px(x + winW / 2, winY, 1, winH, '#5a4636');
  }
  // cửa ra vào
  const dw = 18, dh = 22, dx = W / 2 - dw / 2;
  px(dx - 2, H - dh - 2, dw + 4, dh + 2, '#5a4636');
  px(dx, H - dh, dw, dh, '#8a5a3c');
  px(dx + dw / 2, H - dh, 1, dh, '#5a4636');
  px(dx + dw - 5, H - dh / 2, 2, 2, '#ffd166');
  // bậc thềm
  px(dx - 4, H, dw + 8, 4, '#a89a88');
  return cv;
}

export function drawTree(variant = 0) {
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 32;
  const ctx = cv.getContext('2d');
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  px(5, 28, 14, 3, 'rgba(0,0,0,0.22)');
  px(10, 20, 4, 10, '#6b4226'); px(10, 20, 1, 10, '#83532f');
  const dark = variant ? '#2f7d4a' : '#2e7a3a', mid = variant ? '#3e9a5c' : '#3f9b45', lite = variant ? '#62c07e' : '#69c25d';
  const blob = (cx, cy, rr, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fill(); };
  blob(12, 13, 10, dark); blob(9, 11, 7, mid); blob(15, 10, 6, mid); blob(9, 8, 3, lite); blob(14, 7, 2, lite);
  return cv;
}

export function drawLamp() {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 28;
  const ctx = cv.getContext('2d');
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  px(3, 8, 2, 18, '#2b2d42'); px(1, 25, 6, 3, '#2b2d42');
  px(1, 2, 6, 6, '#2b2d42'); px(2, 3, 4, 4, '#ffd166'); px(2, 0, 4, 2, '#2b2d42');
  return cv;
}

export function drawBench() {
  const cv = document.createElement('canvas');
  cv.width = 24; cv.height = 14;
  const ctx = cv.getContext('2d');
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  px(0, 0, 24, 3, '#8a5a3c'); px(0, 5, 24, 4, '#a8704a'); px(0, 5, 24, 1, '#c08a60');
  px(2, 9, 2, 5, '#4a3424'); px(20, 9, 2, 5, '#4a3424');
  return cv;
}

export function drawFountain() {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 40;
  const ctx = cv.getContext('2d');
  const ell = (cx, cy, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  ell(24, 28, 23, 11, '#8e8a99');
  ell(24, 27, 20, 9, '#3d8fd6');
  ell(20, 25, 6, 2, '#8cc8f5');
  ctx.fillStyle = '#9d99a8'; ctx.fillRect(21, 10, 6, 17);
  ell(24, 11, 9, 4, '#8e8a99');
  ell(24, 10, 7, 3, '#5aa8e8');
  ctx.fillStyle = '#bfe3ff'; ctx.fillRect(23, 2, 2, 8);
  return cv;
}

/** Danh sách cây (tile) rải ngẫu nhiên + viền rừng. */
export function treePositions() {
  const r = rng(7);
  const out = [];
  for (let tx = 0; tx < MAP_W; tx += 1.5) { out.push([tx, 0.6]); out.push([tx + 0.7, MAP_H - 0.6]); }
  for (let ty = 1.5; ty < MAP_H - 1; ty += 1.5) { out.push([0.6, ty]); out.push([MAP_W - 0.6, ty + 0.7]); }
  for (let i = 0; i < 120; i++) {
    const tx = 2 + Math.floor(r() * (MAP_W - 4)), ty = 2 + Math.floor(r() * (MAP_H - 4));
    if (isFree(tx, ty) && isFree(tx, ty - 1) && isFree(tx + 1, ty)) out.push([tx + 0.5, ty + 0.9]);
  }
  return out;
}
