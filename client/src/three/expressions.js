// 😆 Biểu cảm khuôn mặt + hành động của nhân vật.
// Mặt vẽ lên canvas nhỏ rồi dán lên một mảnh cầu ôm sát phía trước đầu (dùng chung texture cho mọi người).
import * as THREE from 'three';
import { Q } from './quality.js';

/**
 * Danh sách hành động. face: kiểu mặt; float: emoji bay lên; dur: giây.
 * 4 cái đầu giữ phím tắt 7 8 9 0 như cũ.
 */
export const EMOTE_LIST = [
  { id: 'dance', icon: '💃', name: 'Nhảy', face: 'happy', dur: 2.6 },
  { id: 'bow', icon: '🙇', name: 'Cúi chào', face: 'calm', dur: 2.6 },
  { id: 'wave', icon: '👋', name: 'Vẫy tay', face: 'smile', dur: 2.6 },
  { id: 'spin', icon: '🌀', name: 'Xoay vòng', face: 'happy', dur: 2.6 },
  { id: 'laugh', icon: '😆', name: 'Cười lăn', face: 'laugh', float: '😆', dur: 3 },
  { id: 'love', icon: '😍', name: 'Thả tim', face: 'love', float: '💕', dur: 3 },
  { id: 'angry', icon: '😡', name: 'Tức giận', face: 'angry', float: '💢', dur: 3 },
  { id: 'cry', icon: '😭', name: 'Khóc nhè', face: 'cry', float: '💧', dur: 3.2 },
  { id: 'shock', icon: '😱', name: 'Hết hồn', face: 'shock', float: '❗', dur: 2.4 },
  { id: 'sleep', icon: '😴', name: 'Ngủ gật', face: 'sleep', float: '💤', dur: 4 },
  { id: 'shy', icon: '😳', name: 'Ngại ngùng', face: 'shy', float: '🌸', dur: 3 },
  { id: 'cheer', icon: '🎉', name: 'Ăn mừng', face: 'laugh', float: '🎉', dur: 2.8 },
];
export const EMOTES = Object.fromEntries(EMOTE_LIST.map((e) => [e.id, e]));

// Mảnh cầu phía trước đầu: rộng 1.8 rad × cao 1.2 rad (≈ 133 px / rad trên canvas 240 × 160)
const W = 240, H = 160, CX = 120, EY = 67, EX = 44, BY = 96, BX = 80, MY = 118;
export const FACE_GEO = new THREE.SphereGeometry(0.316, 20, 12, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.5, 1.2);
FACE_GEO.userData.shared = true;

const INK = '#1d1820';
const draw = {
  eyesOpen(c, rx = 13, ry = 19) { for (const s of [-1, 1]) { c.fillStyle = INK; c.beginPath(); c.ellipse(CX + s * EX, EY, rx, ry, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(CX + s * EX - 4, EY - 7, 4.5, 0, 7); c.fill(); } },
  arcs(c, up = true, w = 15) { // ^ ^ (up) hoặc ︶ ︶ (nhắm)
    c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); if (up) c.arc(CX + s * EX, EY + 8, w, Math.PI * 1.15, Math.PI * 1.85); else c.arc(CX + s * EX, EY - 6, w, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); }
  },
  blush(c, a = 0.55, big = 1) { c.fillStyle = `rgba(255,120,130,${a})`; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(CX + s * BX, BY, 17 * big, 9 * big, 0, 0, 7); c.fill(); } },
  smile(c, w = 16) { c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.arc(CX, MY - 10, w, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); },
  openMouth(c, w = 20, h = 16) { c.fillStyle = '#7a2230'; c.beginPath(); c.moveTo(CX - w, MY - 6); c.quadraticCurveTo(CX, MY - 6 + h * 2.2, CX + w, MY - 6); c.closePath(); c.fill(); c.fillStyle = '#ff7a8a'; c.beginPath(); c.ellipse(CX, MY + h * 0.55, w * 0.5, h * 0.35, 0, 0, 7); c.fill(); },
  heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.4, x, y - s * 0.5); c.bezierCurveTo(x + s * 0.7, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); c.fill(); },
};

const FACES = {
  smile(c) { draw.eyesOpen(c); draw.blush(c); draw.smile(c); },
  happy(c) { draw.arcs(c, true); draw.blush(c, 0.65); draw.openMouth(c, 16, 11); },
  calm(c) { draw.arcs(c, false); draw.blush(c, 0.45); draw.smile(c, 12); },
  laugh(c) {
    c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round'; // > <
    for (const s of [-1, 1]) { const x = CX + s * EX; c.beginPath(); c.moveTo(x - s * 12, EY - 12); c.lineTo(x + s * 10, EY); c.lineTo(x - s * 12, EY + 12); c.stroke(); }
    draw.blush(c, 0.7); draw.openMouth(c, 24, 18);
  },
  love(c) { c.fillStyle = '#ff2d55'; for (const s of [-1, 1]) draw.heart(c, CX + s * EX, EY, 17); draw.blush(c, 0.7); draw.openMouth(c, 14, 10); },
  angry(c) {
    c.strokeStyle = INK; c.lineWidth = 7; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(CX + s * (EX + 18), EY - 26); c.lineTo(CX + s * (EX - 14), EY - 12); c.stroke(); }
    for (const s of [-1, 1]) { c.fillStyle = INK; c.beginPath(); c.ellipse(CX + s * EX, EY + 4, 11, 13, 0, 0, 7); c.fill(); }
    draw.blush(c, 0.75, 1.2); // má đỏ bừng
    c.lineWidth = 5; c.beginPath(); c.arc(CX, MY + 8, 15, Math.PI * 1.2, Math.PI * 1.8); c.stroke();
  },
  cry(c) {
    draw.arcs(c, false, 14);
    c.fillStyle = 'rgba(90,170,255,.9)';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(CX + s * (EX - 6), EY + 4); c.lineTo(CX + s * (EX + 6), EY + 4); c.lineTo(CX + s * (EX + 9), H); c.lineTo(CX + s * (EX - 9), H); c.fill(); }
    c.fillStyle = '#7a2230'; c.beginPath(); c.ellipse(CX, MY, 16, 12, 0, Math.PI, 0); c.fill();
    c.fillRect(CX - 16, MY - 1, 32, 6);
  },
  shock(c) {
    for (const s of [-1, 1]) { c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.ellipse(CX + s * EX, EY, 17, 22, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(CX + s * EX, EY + 2, 6, 0, 7); c.fill(); }
    c.fillStyle = '#7a2230'; c.beginPath(); c.ellipse(CX, MY + 2, 11, 15, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(120,140,255,.35)'; c.fillRect(0, 0, W, 28);
  },
  sleep(c) {
    c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(CX + s * EX - 14, EY + 4); c.lineTo(CX + s * EX + 14, EY + 4); c.stroke(); }
    draw.blush(c, 0.4); c.fillStyle = '#7a2230'; c.beginPath(); c.arc(CX, MY - 2, 7, 0, 7); c.fill();
    c.fillStyle = 'rgba(170,220,255,.9)'; c.beginPath(); c.arc(CX + 22, MY - 16, 9, 0, 7); c.fill(); // bong bóng mũi
  },
  shy(c) {
    for (const s of [-1, 1]) { c.fillStyle = INK; c.beginPath(); c.ellipse(CX + s * EX, EY + 6, 10, 13, 0, 0, 7); c.fill(); }
    draw.blush(c, 0.85, 1.35);
    c.strokeStyle = '#d0445a'; c.lineWidth = 3; // gạch hồng trên má
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) { const x = CX + s * BX + k * 10; c.beginPath(); c.moveTo(x - 3, BY + 6); c.lineTo(x + 4, BY - 6); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(CX - 12, MY - 6); for (let k = 0; k <= 4; k++) c.lineTo(CX - 12 + k * 6, MY - 6 + (k % 2 ? 5 : 0)); c.stroke();
  },
};

const cache = new Map();
/** Vật liệu cho kiểu mặt (tạo 1 lần, dùng chung). */
export function faceMaterial(face) {
  if (!cache.has(face)) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    (FACES[face] || FACES.smile)(c);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const opts = { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 };
    cache.set(face, Q.cheapMaterials ? new THREE.MeshLambertMaterial(opts) : new THREE.MeshStandardMaterial({ ...opts, roughness: 0.8 }));
  }
  return cache.get(face);
}
