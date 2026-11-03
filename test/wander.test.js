// Đường đi của con vật: tất định, không NaN, ở đúng khu, vịt con theo sát mẹ.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITTERS, critterAt, RING } from '../client/src/game/wander.js';
import { PLAZA } from '../client/src/game/map.js';

const T0 = 1_762_000_000; // một mốc giờ bất kỳ (giây)

test('cùng thời điểm → cùng vị trí (mọi máy thấy giống nhau)', () => {
  for (let i = 0; i < CRITTERS.length; i++) assert.deepEqual(critterAt(i, T0 + 123.456), critterAt(i, T0 + 123.456));
});

test('không bao giờ ra NaN, kể cả ở ranh giới đoạn đường', () => {
  for (let i = 0; i < CRITTERS.length; i++) for (let k = 0; k < 4000; k++) {
    const p = critterAt(i, T0 + k * 0.37);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.rot), `con ${i} lúc ${k}`);
  }
});

test('con vật đi lại trong khu của mình', () => {
  for (const d of CRITTERS) {
    if (!d.rect) continue;
    const [x, z, w, h] = d.rect;
    for (let k = 0; k < 3000; k++) {
      const p = critterAt(d.i, T0 + k * 0.53);
      assert.ok(p.x >= x - 1e-9 && p.x <= x + w + 1e-9 && p.z >= z - 1e-9 && p.z <= z + h + 1e-9, `${d.name} ra ngoài khu`);
    }
  }
});

test('cún chạy vòng quanh, không băng qua đài phun nước', () => {
  const dog = CRITTERS.find((d) => d.ring);
  for (let k = 0; k < 5000; k++) {
    const p = critterAt(dog.i, T0 + k * 0.21);
    const r = Math.hypot(p.x - PLAZA.x, p.z - PLAZA.z);
    assert.ok(r > RING.min - 0.05 && r < RING.min + RING.span + 0.05, `bán kính ${r.toFixed(2)}`);
  }
});

test('vịt con bơi thành hàng sau vịt mẹ, không chồng lên nhau', () => {
  const kids = CRITTERS.filter((d) => d.follow === 0);
  for (let k = 0; k < 2000; k++) {
    const t = T0 + k * 0.29, mom = critterAt(0, t);
    const ps = kids.map((d) => critterAt(d.i, t));
    for (const p of ps) assert.ok(Math.hypot(p.x - mom.x, p.z - mom.z) < 4, 'vịt con lạc mẹ');
    for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) assert.ok(Math.hypot(ps[a].x - ps[b].x, ps[a].z - ps[b].z) > 0.2, 'vịt con chồng lên nhau');
  }
});
