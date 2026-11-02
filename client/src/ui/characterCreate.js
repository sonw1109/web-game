import * as THREE from 'three';
import { PALETTE, DEFAULT_APPEARANCE, randomAppearance } from '../game/character.js';
import { Avatar } from '../three/avatar.js';
import { cushion } from '../three/props.js';
import { Pet } from '../three/pet.js';

// Xem trước nhân vật 3D (renderer nhỏ riêng, tạo 1 lần)
let preview = null;
function getPreview(canvas) {
  if (preview) return preview;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(canvas.clientWidth || 180, canvas.clientHeight || 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 180) / (canvas.clientHeight || 240), 0.1, 20);
  camera.position.set(0, 1.0, 4.2);
  camera.lookAt(0, 0.62, 0);
  scene.add(new THREE.HemisphereLight('#fff1dc', '#5a3a2a', 1.4));
  const key = new THREE.DirectionalLight('#ffd7a3', 2.2);
  key.position.set(2, 4, 3); key.castShadow = true;
  scene.add(key);
  const base = cushion();
  base.scale.setScalar(0.9);
  scene.add(base);
  preview = { renderer, scene, camera, avatar: null, key: '' };
  return preview;
}

/** Hiện màn hình tạo nhân vật. Resolve với { name, appearance }. */
export function showCharacterCreate(existing) {
  const screen = document.getElementById('screen-create');
  const form = document.getElementById('create-form');
  const nameInput = document.getElementById('char-name');
  const canvas = document.getElementById('char-preview');
  const app = { ...DEFAULT_APPEARANCE, ...(existing?.appearance || randomAppearance()) };
  nameInput.value = existing?.name || '';
  screen.hidden = false;

  // ---- dựng các ô chọn ----
  const renderPickers = () => {
    for (const box of form.querySelectorAll('[data-part]')) {
      const part = box.dataset.part;
      box.replaceChildren();
      if (part === 'hairStyle' || part === 'pet') {
        const list = part === 'pet' ? PALETTE.pets : PALETTE.hairStyles;
        list.forEach((label, i) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = `chip${(app[part] | 0) === i ? ' active' : ''}`; b.textContent = label;
          b.onclick = () => { app[part] = i; renderPickers(); };
          box.append(b);
        });
      } else {
        for (const col of PALETTE[part]) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = `swatch${app[part] === col ? ' active' : ''}`;
          b.style.background = col; b.title = col;
          b.onclick = () => { app[part] = col; renderPickers(); };
          box.append(b);
        }
      }
    }
  };
  renderPickers();
  document.getElementById('char-random').onclick = () => { Object.assign(app, randomAppearance()); renderPickers(); };

  // ---- xem trước 3D xoay tròn ----
  const pv = getPreview(canvas);
  let t = 0;
  const timer = setInterval(() => {
    const key = JSON.stringify(app);
    if (key !== pv.key) {
      pv.avatar?.dispose();
      pv.avatar = new Avatar(app);
      pv.avatar.root.position.y = 0.12;
      pv.scene.add(pv.avatar.root);
      pv.pet?.dispose();
      pv.pet = app.pet ? new Pet(['', 'cat', 'dog', 'chick', 'bunny'][app.pet], pv.scene) : null;
      if (pv.pet) { pv.pet.root.position.set(0.48, 0.02, 0.25); pv.pet.root.rotation.y = -0.5; }
      pv.key = key;
    }
    t += 1 / 30;
    pv.avatar.root.rotation.y = Math.sin(t * 0.9) * 0.9;
    pv.avatar.targetRot = pv.avatar.root.rotation.y;
    pv.avatar.update(1 / 30, t);
    pv.renderer.render(pv.scene, pv.camera);
  }, 1000 / 30);

  setTimeout(() => nameInput.focus(), 50);

  return new Promise((resolve) => {
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = nameInput.value.trim().slice(0, 16);
      if (!name) return nameInput.focus();
      clearInterval(timer);
      screen.hidden = true;
      resolve({ name, appearance: { ...app } });
    };
  });
}
