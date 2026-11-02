// Cần điều khiển ảo cho điện thoại: kéo núm để đi (đẩy nhẹ = đi chậm).
export function createJoystick(onMove) {
  const base = document.createElement('div');
  base.className = 'joystick';
  base.innerHTML = '<div class="knob"></div>';
  document.body.append(base);
  const knob = base.firstChild;
  const R = 46;
  let id = null, cx = 0, cy = 0;

  const set = (dx, dy) => {
    const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
    dx *= k; dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / R, dy / R);
  };
  base.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    base.setPointerCapture(id);
    const r = base.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    base.classList.add('active');
    set(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; base.classList.remove('active'); set(0, 0); };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  base.addEventListener('lostpointercapture', (e) => end(e));
  return base;
}
