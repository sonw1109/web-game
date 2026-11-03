// Bố cục bản đồ: nhà không chồng nhau, cửa/ghế/chiếu quỳ đều tới được từ điểm xuất hiện.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS, PLAZA, SPAWN, TILE, MAP_W, MAP_H, LAKE, POND, DOCK, BENCHES, SEATS, SHRINE, STATUE, ALTAR, MATS,
  inHouse, treePositions, GROUND,
} from '../client/src/game/map.js';

const R = 0.28; // bán kính nhân vật (controller.js)
const trees = treePositions();
const beds = [[12, 37.5, 6, 2], [12, 41, 6, 2], [31, 37.5, 6, 2], [31, 41, 6, 2]];
const inRect = (x, z, [rx, rz, w, h], m = 0) => x > rx - m && x < rx + w + m && z > rz - m && z < rz + h + m;
const water = (x, z) => {
  if (inRect(x, z, [POND.x, POND.y, POND.w, POND.h], R)) return true;
  if (!inRect(x, z, [LAKE.x, LAKE.y, LAKE.w, LAKE.h], R)) return false;
  return !(x > DOCK.x + R && x < DOCK.x + DOCK.w - R && z > DOCK.y); // bến gỗ đi được
};
/** Ô (x, z) có đi được không – mô phỏng gần đúng va chạm của controller + worldView. */
function walkable(x, z) {
  if (x < 1 + R || z < 1 + R || x > MAP_W - 1 - R || z > MAP_H - 1 - R) return false;
  if (BUILDINGS.some((b) => inHouse(b, x, z, 0.15 + R))) return false;
  if (BENCHES.some((b) => inHouse({ cx: b.x, cz: b.z, rot: b.ry, w: 1.3, d: 0.42 }, x, z, 0.15 + R))) return false;
  if (inHouse({ cx: ALTAR.x, cz: ALTAR.z, rot: 0, w: ALTAR.w, d: ALTAR.d }, x, z, 0.15 + R)) return false;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 1.45 + R) return false;                 // đài phun nước
  if (Math.hypot(x - (PLAZA.x - 4.6), z - (PLAZA.z - 0.6)) < 0.75 + R) return false; // vòng quay
  if (Math.hypot(x - STATUE.x, z - STATUE.z) < 2.45 + R) return false;
  if (beds.some((b) => inRect(x, z, b, R))) return false;
  if (trees.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.3 + R)) return false;
  return !water(x, z);
}
// BFS trên lưới 0.25 m từ điểm xuất hiện
const STEP = 0.25, W = Math.ceil(MAP_W / STEP), H = Math.ceil(MAP_H / STEP);
const seen = new Uint8Array(W * H);
{
  const sx = Math.round(SPAWN.x / TILE / STEP), sz = Math.round(SPAWN.y / TILE / STEP);
  const q = [[sx, sz]]; seen[sz * W + sx] = 1;
  while (q.length) {
    const [cx, cz] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || seen[nz * W + nx]) continue;
      if (!walkable(nx * STEP, nz * STEP)) continue;
      seen[nz * W + nx] = 1; q.push([nx, nz]);
    }
  }
}
const reachable = (x, z) => {
  const cx = Math.round(x / STEP), cz = Math.round(z / STEP);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (seen[(cz + dz) * W + cx + dx]) return true;
  return false;
};

test('điểm xuất hiện đi lại được', () => assert.ok(walkable(SPAWN.x / TILE, SPAWN.y / TILE)));

test('7 ngôi nhà không dính nhau (cách nhau ≥ 2.5 m)', () => {
  /** Các điểm dọc 4 cạnh của nhà b, nới ra m mét (đổi từ hệ tọa độ nhà sang thế giới). */
  const perimeter = (b, m) => {
    const hw = b.w / 2 + m, hd = b.d / 2 + m, c = Math.cos(b.rot), s = Math.sin(b.rot), pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = (k / 16) * 2 - 1;
      for (const [lx, lz] of [[u * hw, -hd], [u * hw, hd], [-hw, u * hd], [hw, u * hd]]) pts.push([b.cx + lx * c + lz * s, b.cz - lx * s + lz * c]);
    }
    return pts;
  };
  for (const a of BUILDINGS) for (const b of BUILDINGS) {
    if (a === b) continue;
    for (const [x, z] of perimeter(a, 1.25)) assert.ok(!inHouse(b, x, z, 1.25), `${a.id} quá sát ${b.id}`);
  }
});

test('mọi cửa nhà quay vào quảng trường và đi tới được', () => {
  for (const b of BUILDINGS) {
    const toCenter = Math.atan2(PLAZA.x - b.cx, PLAZA.z - b.cz);
    assert.ok(Math.abs(Math.atan2(Math.sin(toCenter - b.rot), Math.cos(toCenter - b.rot))) < 0.01, `${b.id} không quay vào giữa`);
    assert.ok(Math.hypot(b.door.x - PLAZA.x, b.door.z - PLAZA.z) < PLAZA.r, `cửa ${b.id} nằm ngoài sân`);
    const stand = { x: b.door.x + b.dir.x * 0.6, z: b.door.z + b.dir.z * 0.6 };
    assert.ok(reachable(stand.x, stand.z), `không tới được cửa ${b.id}`);
  }
});

test('mọi chỗ ngồi đều tới được, không nằm trong nhà/nước', () => {
  assert.equal(SEATS.length, BENCHES.length * 2);
  for (const [i, s] of SEATS.entries()) {
    assert.ok(reachable(s.sx, s.sz), `chỗ ngồi ${i} (ghế ${s.bench}) không tới được`);
    assert.ok(Number.isFinite(s.y) && s.y > 0.3);
  }
});

test('tượng đài: chiếu quỳ và bàn thờ tới được, không có cây mọc trong sân', () => {
  for (const [i, m] of MATS.entries()) assert.ok(reachable(m.x, m.z), `chiếu ${i}`);
  assert.ok(reachable(ALTAR.x + ALTAR.w / 2 + 0.5, ALTAR.z), 'trước bàn thờ');
  for (const [x, z] of trees) assert.ok(Math.hypot(x - SHRINE.x, z - SHRINE.z) > SHRINE.r + 0.5, `cây ở (${x}, ${z}) mọc trong sân tượng`);
});

test('bến câu đi ra được tới cuối', () => assert.ok(reachable(DOCK.x + DOCK.w / 2, LAKE.y + LAKE.h - 0.5)));

test('cây không mọc trên đường / sân / nước', () => {
  for (const [x, z] of trees) {
    const t = GROUND[Math.floor(z)]?.[Math.floor(x)];
    assert.ok(t === 0 || t === undefined, `cây ở (${x}, ${z}) mọc trên ô loại ${t}`);
  }
});
