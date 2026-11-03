// 🗺️ Bản đồ nhỏ: thấy bạn bè đang ở đâu, bấm vào tòa nhà / khu vực để dịch chuyển tới.
import { store } from '../store.js';
import { MAP_W, MAP_H, GROUND, BUILDINGS, LAKE, DOCK, GARDEN, GAZEBO, PLAZA, SHRINE, MATS } from '../game/map.js';

const COLORS = ['#5f9e4b', '#cdb994', '#e0d0b2', '#3f8fd0', '#86b86a'];

export function initMinimap({ getWorld }) {
  const box = document.getElementById('minimap');
  const cv = box.querySelector('canvas');
  const S = 4; // px mỗi ô
  cv.width = MAP_W * S; cv.height = MAP_H * S;
  const ctx = cv.getContext('2d');
  // nền vẽ 1 lần
  const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
  const b = bg.getContext('2d');
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) { b.fillStyle = COLORS[GROUND[y][x]]; b.fillRect(x * S, y * S, S, S); }
  for (const bd of BUILDINGS) { b.save(); b.translate(bd.cx * S, bd.cz * S); b.rotate(-bd.rot); b.fillStyle = bd.roof; b.fillRect((-bd.w / 2) * S, (-bd.d / 2) * S, bd.w * S, bd.d * S); b.restore(); }
  b.fillStyle = '#8a5a3c'; b.fillRect(DOCK.x * S, DOCK.y * S, DOCK.w * S, DOCK.h * S);
  b.font = `${S * 3.2}px sans-serif`; b.textAlign = 'center'; b.textBaseline = 'middle';
  const spots = [
    ...BUILDINGS.map((bd) => ({ icon: bd.icon, x: bd.cx, y: bd.cz, go: () => ({ x: bd.door.x + bd.dir.x * 0.6, z: bd.door.z + bd.dir.z * 0.6 }), rect: [bd.cx - 4, bd.cz - 4, 8, 8] })),
    { icon: '🎣', x: LAKE.x + LAKE.w / 2, y: LAKE.y + LAKE.h / 2, go: () => ({ x: DOCK.x + 1, z: LAKE.y + LAKE.h + 0.6 }), rect: [LAKE.x, LAKE.y, LAKE.w, LAKE.h] },
    { icon: '🌸', x: GARDEN.x + GARDEN.w / 2, y: GARDEN.y + GARDEN.h / 2, go: () => ({ x: 54, z: 11 }), rect: [GARDEN.x, GARDEN.y, GARDEN.w, GARDEN.h] },
    { icon: '🙏', x: SHRINE.x - 1.6, y: SHRINE.z, go: () => ({ x: MATS[1].x + 1.6, z: MATS[1].z }), rect: [SHRINE.x - 4, SHRINE.z - 4, 8, 8] },
    { icon: '🏯', x: GAZEBO.x, y: GAZEBO.y, go: () => ({ x: GAZEBO.x, z: GAZEBO.y + 2.8 }), rect: [GAZEBO.x - 3, GAZEBO.y - 3, 6, 6] },
    { icon: '🎡', x: PLAZA.x - 4.6, y: PLAZA.z - 0.6, go: () => getWorld().wheelFront, rect: [PLAZA.x - 6, PLAZA.z - 2, 2.8, 2.8] },
    { icon: '⛲', x: PLAZA.x, y: PLAZA.z, go: () => ({ x: PLAZA.x, z: PLAZA.z + 2.6 }), rect: [PLAZA.x - 2.5, PLAZA.z - 2.5, 5, 5] },
  ];
  for (const s of spots) b.fillText(s.icon, s.x * S, s.y * S);

  function draw() {
    if (box.hidden || document.body.classList.contains('in-room') || document.getElementById('game').hidden) return;
    ctx.drawImage(bg, 0, 0);
    for (const p of store.players.values()) {
      if (p.room !== 'lobby' || p.id === store.selfId || p.bot) continue;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc((p.x / 16) * S, (p.y / 16) * S, S * 0.9, 0, 7); ctx.fill(); ctx.stroke();
    }
    const w = getWorld();
    if (w) {
      const { x, z } = w.ctrl.pos, a = w.me.root.rotation.y;
      ctx.save(); ctx.translate(x * S, z * S); ctx.rotate(-a);
      ctx.fillStyle = '#ff8a4c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, S * 2); ctx.lineTo(S * 1.3, -S * 1.2); ctx.lineTo(-S * 1.3, -S * 1.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  setInterval(draw, 250);

  cv.addEventListener('click', (e) => {
    const w = getWorld();
    if (!w || store.room !== 'lobby') return;
    const r = cv.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * MAP_W, ty = ((e.clientY - r.top) / r.height) * MAP_H;
    const hit = spots.find((s) => tx >= s.rect[0] && tx <= s.rect[0] + s.rect[2] && ty >= s.rect[1] && ty <= s.rect[1] + s.rect[3]);
    let to = hit?.go();
    if (to) to = { x: to.x, z: to.z };
    else if (!w.ctrl.blocked(tx, ty)) to = { x: tx, z: ty };
    if (!to) return;
    w.ctrl.pos = { x: to.x, z: to.z };
    w.ctrl.target = null;
    w.myPet && (w.myPet.placed = false);
    draw();
  });
  box.querySelector('[data-toggle]').onclick = () => box.classList.toggle('small');
  draw();
}
