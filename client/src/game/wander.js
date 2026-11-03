// 🐾 Đường đi tất định của các con vật quanh sảnh – chỉ phụ thuộc đồng hồ, nên mọi máy
// tính ra cùng một vị trí mà không cần gửi qua mạng. Module thuần (không cần trình duyệt) để test được.
import { PLAZA, GAZEBO } from './map.js';

/** Băm 2 số nguyên → số thực [0, 1). */
export function hash(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b % 1e6) | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const smooth = (u) => u * u * (3 - 2 * u);
export const RING = { min: 8.4, span: 0.8 }; // cún chạy vòng quanh đài phun nước ở bán kính 8.4–9.2 m

/**
 * kind, name, sound, range (khoảng cách vuốt ve được)
 * rect: [x, z, w, h] khu đi lại · ring: chạy vòng quanh đài phun nước · fixed: [x, y, z, rot] đứng yên · follow: đi sau con số …
 */
export const CRITTERS = [
  { kind: 'duck', name: 'Vịt mẹ', icon: '🦆', sound: 'quack', rect: [45, 21, 4.2, 7], water: true, speed: 0.55, seg: 7, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 0.45, water: true, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 0.9, water: true, range: 2.6 },
  { kind: 'duckling', name: 'Vịt con', icon: '🐥', sound: 'peep', follow: 0, lag: 1.35, water: true, range: 2.6 },
  { kind: 'duck', name: 'Vịt bầu', icon: '🦆', sound: 'quack', rect: [53, 21, 4.2, 7], water: true, speed: 0.5, seg: 8, range: 2.6 },
  { kind: 'duck', name: 'Vịt cỏ', icon: '🦆', sound: 'quack', rect: [2.7, 9.7, 3.6, 2.6], water: true, speed: 0.35, seg: 9, range: 2.4 },
  { kind: 'hen', name: 'Gà mái', icon: '🐔', sound: 'cluck', rect: [39, 37, 6, 5], speed: 0.9, seg: 5, range: 1.5 },
  { kind: 'hen', name: 'Gà mái', icon: '🐔', sound: 'cluck', rect: [39, 37, 6, 5], speed: 0.8, seg: 6, range: 1.5 },
  { kind: 'chick', name: 'Gà con', icon: '🐤', sound: 'peep', follow: 6, lag: 0.7, range: 1.4 },
  { kind: 'dog', name: 'Cún Vàng', icon: '🐶', sound: 'woof', ring: true, speed: 1.6, seg: 6, range: 1.5 },
  { kind: 'cat', name: 'Mèo Mướp', icon: '🐱', sound: 'meow', fixed: [GAZEBO.x + 1.2, 0.25, GAZEBO.y + 0.2, -1.2], sleep: true, range: 1.6 },
  { kind: 'bunny', name: 'Thỏ Bông', icon: '🐰', sound: 'squeak', rect: [47.5, 9.8, 4.5, 3], speed: 1.1, seg: 5, hop: true, range: 1.4 },
  { kind: 'bunny', name: 'Thỏ Ngọc', icon: '🐰', sound: 'squeak', rect: [56, 9.8, 4.5, 3], speed: 1.1, seg: 6, hop: true, range: 1.4 },
  { kind: 'buffalo', name: 'Trâu Đen', icon: '🐃', sound: 'moo', rect: [3, 27.5, 6, 4], speed: 0.35, seg: 12, range: 2.2 },
].map((d, i) => ({ ...d, i, seed: i * 7919 + 13 }));

/** Vị trí + hướng + đang đi? của con thứ i tại thời điểm t (giây). */
export function critterAt(i, t, list = CRITTERS) {
  const d = list[i];
  if (d.fixed) return { x: d.fixed[0], z: d.fixed[2], rot: d.fixed[3], moving: false };
  if (d.follow != null) {
    const p = critterAt(d.follow, t - d.lag, list), q = critterAt(d.follow, t - d.lag - 0.15, list);
    const moving = Math.hypot(p.x - q.x, p.z - q.z) > 0.01;
    const rot = moving ? Math.atan2(p.x - q.x, p.z - q.z) : p.rot;
    const sp = d.lag * 0.75; // xếp hàng sau lưng (~0.35 m mỗi con), mẹ dừng thì con không chồng lên nhau
    return { x: p.x - Math.sin(rot) * sp, z: p.z - Math.cos(rot) * sp, rot, moving };
  }
  const T = d.seg, k = Math.floor(t / T), u = t - k * T;
  const P = (n) => {
    if (d.ring) { const a = n * 0.8 + Math.sin(n * 1.3 + d.seed) * 0.6, r = RING.min + hash(d.seed, n) * RING.span; return [PLAZA.x + Math.cos(a) * r, PLAZA.z + Math.sin(a) * r]; }
    const [x, z, w, h] = d.rect;
    return [x + hash(d.seed, n * 2) * w, z + hash(d.seed, n * 2 + 1) * h];
  };
  const A = P(k), B = P(k + 1);
  const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const travel = Math.min(T * 0.75, dist / d.speed);
  const rot = Math.atan2(B[0] - A[0], B[1] - A[1]);
  if (u >= travel) return { x: B[0], z: B[1], rot, moving: false }; // (travel = 0 khi 2 điểm trùng → đứng yên, không chia 0)
  const f = smooth(u / travel);
  if (d.ring) { // vòng quanh: nội suy theo góc để không cắt ngang đài phun nước
    const a0 = Math.atan2(A[1] - PLAZA.z, A[0] - PLAZA.x), r0 = Math.hypot(A[0] - PLAZA.x, A[1] - PLAZA.z);
    let a1 = Math.atan2(B[1] - PLAZA.z, B[0] - PLAZA.x); const r1 = Math.hypot(B[0] - PLAZA.x, B[1] - PLAZA.z);
    a1 = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    const a = a0 + (a1 - a0) * f, r = r0 + (r1 - r0) * f, dir = Math.sign(a1 - a0) || 1;
    return { x: PLAZA.x + Math.cos(a) * r, z: PLAZA.z + Math.sin(a) * r, rot: Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), moving: true };
  }
  return { x: A[0] + (B[0] - A[0]) * f, z: A[1] + (B[1] - A[1]) * f, rot, moving: true };
}
