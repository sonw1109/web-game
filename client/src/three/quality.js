// Chất lượng đồ họa: tự nhận diện máy yếu / điện thoại, hoặc người dùng tự chọn (lưu localStorage).
const KEY = 'hoiquan.quality';

export const PRESETS = {
  high:   { label: 'Cao',        maxPR: 2,    minPR: 1,    shadows: true,  shadowSize: 2048, softShadows: true,  extraLights: true,  antialias: true,  cheapMaterials: false, groundRes: 32 },
  medium: { label: 'Trung bình', maxPR: 1.5,  minPR: 0.75, shadows: true,  shadowSize: 1024, softShadows: false, extraLights: false, antialias: true,  cheapMaterials: false, groundRes: 24 },
  low:    { label: 'Thấp',       maxPR: 1,    minPR: 0.6,  shadows: false, shadowSize: 512,  softShadows: false, extraLights: false, antialias: false, cheapMaterials: true,  groundRes: 16 },
};

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const isMobile = () => isTouch() && Math.min(screen.width, screen.height) < 820;

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name);
  } catch { return ''; }
}

/** Đoán mức phù hợp cho máy này. */
export function detectLevel() {
  const gpu = gpuName();
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (/swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [3-5]\d\d|powervr/i.test(gpu)) return 'low';
  if (isMobile()) return cores <= 4 || mem <= 3 ? 'low' : 'medium';
  if (/intel/i.test(gpu) && !/iris|arc/i.test(gpu)) return 'medium';
  if (cores <= 2 || mem <= 2) return 'low';
  return 'high';
}

export function savedChoice() { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } }
export function saveChoice(v) { try { localStorage.setItem(KEY, v); } catch {} }

const choice = savedChoice();
export const level = choice !== 'auto' && PRESETS[choice] ? choice : detectLevel();
export const Q = { level, auto: choice === 'auto', ...PRESETS[level] };
