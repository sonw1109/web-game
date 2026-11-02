// Vẽ nhân vật pixel 16x24 theo lớp (da, tóc, áo, quần) – không cần file ảnh.
export const FRAME_W = 16;
export const FRAME_H = 24;
export const DIRS = ['down', 'left', 'right', 'up'];
export const FRAMES_PER_DIR = 3; // 0 = đứng, 1/2 = bước chân

export const PALETTE = {
  skin: ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'],
  hair: ['#1b1b1f', '#3b2a20', '#7a4a26', '#c98b3a', '#e8d27a', '#d9d9e3', '#e0487a', '#5b6cff', '#3fbf8f'],
  shirt: ['#4f8cff', '#ff5f6d', '#ff8a4c', '#3ddc97', '#ffd166', '#a06cff', '#f5f5f5', '#2b2d42', '#e05a9a'],
  pants: ['#2d3446', '#1f2a5a', '#4a3424', '#5b5f6a', '#2f5d3a', '#7a2e3a', '#d7c7a1'],
  hairStyles: ['Ngắn', 'Dài', 'Dựng', 'Búi'],
};

export const DEFAULT_APPEARANCE = { skin: '#f1c27d', hair: '#3b2a20', hairStyle: 0, shirt: '#4f8cff', pants: '#2d3446' };

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const randomAppearance = () => ({
  skin: pick(PALETTE.skin), hair: pick(PALETTE.hair), hairStyle: Math.floor(Math.random() * 4),
  shirt: pick(PALETTE.shirt), pants: pick(PALETTE.pants),
});

export const appearanceKey = (a) => `ch_${a.skin}${a.hair}${a.hairStyle}${a.shirt}${a.pants}`.replace(/#/g, '');

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Vẽ 1 khung hình vào ctx tại (ox, oy). */
export function drawCharacterFrame(ctx, a, dir, frame, ox = 0, oy = 0) {
  const tmp = document.createElement('canvas');
  tmp.width = FRAME_W; tmp.height = FRAME_H;
  const c = tmp.getContext('2d');
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const side = dir === 'left' || dir === 'right';
  const flip = dir === 'left';
  const bob = frame === 0 ? 0 : 1; // nhún nhẹ khi đi
  const y0 = 1 - bob + 1;

  // ---- Chân/quần ----
  const pantsD = shade(a.pants, -0.12);
  const shoe = '#24202a';
  if (side) {
    px(6, 17 + 0, 4, 4, a.pants);
    if (step !== 0) { px(5 + step, 18, 2, 3, pantsD); px(9 - step, 18, 2, 3, a.pants); }
    px(5 + (step > 0 ? 1 : 0), 21, 3, 1, shoe);
    px(8 - (step > 0 ? 1 : 0), 21, 3, 1, shoe);
  } else {
    const lUp = step === 1 ? 1 : 0, rUp = step === -1 ? 1 : 0;
    px(5, 17, 3, 4 - lUp, a.pants); px(8, 17, 3, 4 - rUp, pantsD);
    px(5, 21 - lUp, 3, 1, shoe); px(8, 21 - rUp, 3, 1, shoe);
  }

  // ---- Thân/áo ----
  const shirtD = shade(a.shirt, -0.15);
  px(4, y0 + 10, 8, 6, a.shirt);
  px(4, y0 + 15, 8, 1, shirtD);
  // tay
  const skinD = shade(a.skin, -0.12);
  if (side) {
    const ax = 7 + step;
    px(ax, y0 + 11, 2, 4, shirtD);
    px(ax, y0 + 15, 2, 1, a.skin);
  } else {
    px(3, y0 + 11 + (step === 1 ? -1 : 0), 1, 4, shirtD);
    px(12, y0 + 11 + (step === -1 ? -1 : 0), 1, 4, shirtD);
    px(3, y0 + 15 + (step === 1 ? -1 : 0), 1, 1, a.skin);
    px(12, y0 + 15 + (step === -1 ? -1 : 0), 1, 1, a.skin);
  }

  // ---- Đầu ----
  px(4, y0 + 1, 8, 9, a.skin);
  px(4, y0 + 9, 8, 1, skinD);

  // mắt + má
  const eye = '#1d1a24';
  if (dir === 'down') {
    px(6, y0 + 6, 1, 2, eye); px(9, y0 + 6, 1, 2, eye);
    px(5, y0 + 8, 1, 1, 'rgba(255,120,120,.5)'); px(10, y0 + 8, 1, 1, 'rgba(255,120,120,.5)');
  } else if (side) {
    px(9, y0 + 6, 1, 2, eye);
    px(10, y0 + 8, 1, 1, 'rgba(255,120,120,.5)');
  }

  // ---- Tóc ----
  const h = a.hair, hD = shade(a.hair, -0.15), hL = shade(a.hair, 0.12);
  const style = a.hairStyle | 0;
  if (dir === 'up') {
    px(4, y0, 8, 9, h); px(4, y0 + 8, 8, 1, hD);
    if (style === 1) px(4, y0 + 9, 8, 3, h);
    if (style === 3) px(6, y0 - 2, 4, 3, h);
  } else {
    // mái trên
    px(4, y0, 8, 3, h);
    px(5, y0, 4, 1, hL);
    if (side) {
      px(3, y0 + 1, 3, 6, h); // phía sau đầu (bên trái khung, lật sau)
      px(12, y0 + 2, 0, 0, h);
      if (style === 1) px(3, y0 + 6, 3, 6, h);
    } else {
      px(4, y0 + 3, 1, 3, h); px(11, y0 + 3, 1, 3, h);
      px(5, y0 + 3, 2, 1, h);
      if (style === 1) { px(3, y0 + 2, 1, 9, h); px(12, y0 + 2, 1, 9, h); px(4, y0 + 6, 1, 5, hD); px(11, y0 + 6, 1, 5, hD); }
    }
    if (style === 2) { px(4, y0 - 1, 2, 1, h); px(7, y0 - 2, 2, 2, h); px(10, y0 - 1, 2, 1, h); }
    if (style === 3) { px(6, y0 - 3, 4, 3, h); px(7, y0 - 3, 2, 1, hL); }
  }

  // ---- Viền tối kiểu pixel-art ----
  const img = c.getImageData(0, 0, FRAME_W, FRAME_H);
  const d = img.data;
  const alpha = (x, y) => (x < 0 || y < 0 || x >= FRAME_W || y >= FRAME_H ? 0 : d[(y * FRAME_W + x) * 4 + 3]);
  const out = [];
  for (let y = 0; y < FRAME_H; y++) for (let x = 0; x < FRAME_W; x++) {
    if (alpha(x, y) > 0) continue;
    if (alpha(x - 1, y) > 200 || alpha(x + 1, y) > 200 || alpha(x, y - 1) > 200 || alpha(x, y + 1) > 200) out.push([x, y]);
  }
  c.fillStyle = 'rgba(20,16,30,0.9)';
  for (const [x, y] of out) c.fillRect(x, y, 1, 1);

  // bóng đổ
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(ox + 4, oy + 22, 8, 2);
  ctx.fillRect(ox + 3, oy + 23, 10, 0);
  if (flip) {
    ctx.translate(ox + FRAME_W, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(tmp, 0, 0);
  } else {
    ctx.drawImage(tmp, ox, oy);
  }
  ctx.restore();
}

/** Tạo spritesheet: hàng = hướng (down,left,right,up), cột = khung. */
export function buildCharacterSheet(a) {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * FRAMES_PER_DIR;
  canvas.height = FRAME_H * DIRS.length;
  const ctx = canvas.getContext('2d');
  DIRS.forEach((dir, r) => {
    for (let f = 0; f < FRAMES_PER_DIR; f++) drawCharacterFrame(ctx, a, dir, f, f * FRAME_W, r * FRAME_H);
  });
  return canvas;
}
