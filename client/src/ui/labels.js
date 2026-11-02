// Nhãn HTML (tên, bong bóng chat, emoji bay) đè lên canvas để chữ luôn nét.
export class Labels {
  constructor(root) {
    this.root = root;
    /** @type {Map<string, {el: HTMLElement, bubbleTimer?: number}>} */
    this.items = new Map();
  }

  add(id, name, isMe) {
    this.remove(id);
    const el = document.createElement('div');
    el.className = `plabel${isMe ? ' me' : ''}`;
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = name;
    el.append(nameEl);
    this.root.append(el);
    this.items.set(id, { el });
  }

  addSign(text) {
    const el = document.createElement('div');
    el.className = 'sign';
    el.textContent = text;
    this.root.append(el);
    return el;
  }

  position(id, x, y) {
    const it = this.items.get(id);
    if (it) it.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  setVisible(id, v) {
    const it = this.items.get(id);
    if (it) it.el.hidden = !v;
  }

  bubble(id, text) {
    const it = this.items.get(id);
    if (!it) return;
    it.el.querySelector('.bubble')?.remove();
    clearTimeout(it.bubbleTimer);
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = text;
    it.el.prepend(b);
    it.bubbleTimer = setTimeout(() => b.remove(), 3000 + Math.min(4000, text.length * 60));
  }

  emoji(id, emoji) {
    const it = this.items.get(id);
    if (!it) return;
    const e = document.createElement('span');
    e.className = 'float-emoji';
    e.textContent = emoji;
    e.style.left = `${50 + (Math.random() * 30 - 15)}%`;
    it.el.append(e);
    setTimeout(() => e.remove(), 1800);
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    clearTimeout(it.bubbleTimer);
    it.el.remove();
    this.items.delete(id);
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.root.replaceChildren();
  }
}
