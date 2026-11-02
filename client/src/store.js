// Trạng thái dùng chung giữa Phaser scene và UI overlay.
export const store = {
  selfId: null,
  /** @type {Map<string, {id,name,appearance,x,y,dir,moving,room}>} */
  players: new Map(),
  room: 'lobby',
  events: new EventTarget(),
  emit(type, detail) { this.events.dispatchEvent(new CustomEvent(type, { detail })); },
  on(type, fn) { const h = (e) => fn(e.detail); this.events.addEventListener(type, h); return () => this.events.removeEventListener(type, h); },
  inRoom(room) { return [...this.players.values()].filter((p) => p.room === room); },
};

const LS_CHAR = 'hoiquan.character';
const LS_PASS = 'hoiquan.password';
export const saved = {
  getCharacter() { try { return JSON.parse(localStorage.getItem(LS_CHAR)); } catch { return null; } },
  setCharacter(c) { try { localStorage.setItem(LS_CHAR, JSON.stringify(c)); } catch {} },
  getPassword() { try { return localStorage.getItem(LS_PASS) || ''; } catch { return ''; } },
  setPassword(p) { try { localStorage.setItem(LS_PASS, p); } catch {} },
};
