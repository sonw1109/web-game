// 🎣 Giao diện câu cá: trạng thái chờ, "cá cắn câu!", thẻ kết quả, sổ tay sưu tập + bảng xếp hạng.
import { socket } from '../net/socket.js';
import { store } from '../store.js';
import { sound } from './sound.js';

const $ = (id) => document.getElementById(id);
const RARITY_CLASS = { 'thường': 'r-common', 'hiếm': 'r-rare', 'huyền thoại': 'r-legend', 'rác': 'r-junk' };
const node = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };

export function initFishing() {
  const panel = $('fish-panel');
  let resultTimer = null;

  const show = (...children) => { panel.replaceChildren(...children); panel.hidden = false; };
  const hide = () => { panel.hidden = true; panel.className = 'fish-panel'; };

  store.on('fish', (d) => {
    clearTimeout(resultTimer);
    panel.className = 'fish-panel';
    panel.onclick = null;
    if (d.state === 'waiting') {
      const stop = node('button', 'btn btn-ghost btn-sm', 'Thu cần');
      stop.onclick = () => socket.emit('fish:stop');
      show(node('span', 'fish-wait', '🎣 Đang chờ cá cắn câu… đứng yên nhé'), stop);
    } else if (d.state === 'bite') {
      panel.classList.add('bite');
      show(node('b', null, '❗ CÁ CẮN CÂU!'), node('span', null, document.body.classList.contains('touch') ? 'Chạm vào đây thật nhanh!' : 'Nhấn E thật nhanh!'));
      panel.onclick = () => socket.emit('fish:reel');
      sound.play('tick'); setTimeout(() => sound.play('tick'), 120);
      navigator.vibrate?.(180);
    } else if (d.state === 'result') {
      panel.onclick = null;
      if (d.fish) {
        panel.classList.add('result', RARITY_CLASS[d.fish.rarity]);
        const card = [node('div', 'fish-icon', d.fish.icon), node('div', 'fish-info')];
        card[1].append(node('b', null, d.fish.name), node('span', 'tag', d.fish.rarity), node('span', null, `${d.weight} kg · +${d.fish.pts} điểm`));
        if (d.isNew) card[1].append(node('span', 'new', '✨ MỚI vào sổ tay!'));
        if (d.blessed) card[1].append(node('span', 'new', '🙏 nhờ Ông Chủ phù hộ'));
        show(...card);
        sound.play(d.fish.rarity === 'rác' ? 'wrong' : d.fish.rarity === 'thường' ? 'correct' : 'win');
      } else {
        show(node('span', null, d.early ? '😅 Giật sớm quá – cá sợ chạy mất rồi!' : '😢 Chậm tay rồi, cá ăn mồi chạy mất!'));
        sound.play('wrong');
      }
      resultTimer = setTimeout(hide, 4200);
    } else if (d.state === 'idle' && !panel.classList.contains('result')) hide();
  });

  // ---- sổ tay ----
  const modal = $('fish-book');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });
  socket.on('fish:book', ({ mine, fish, top }) => {
    const body = modal.querySelector('.book-body');
    body.replaceChildren();
    const grid = node('div', 'book-grid');
    for (const f of fish) {
      const got = mine.species[f.id];
      const cell = node('div', `book-cell ${got ? RARITY_CLASS[f.rarity] : 'unknown'}`);
      cell.append(node('div', 'fish-icon', got ? f.icon : '❓'), node('b', null, got ? f.name : '???'), node('span', 'tag', f.rarity));
      if (got) cell.append(node('small', null, `×${got.count} · nặng nhất ${got.best}kg`));
      grid.append(cell);
    }
    const found = Object.keys(mine.species).length;
    const head = node('p', 'muted', `Bạn đã câu ${mine.total} lần · ${found}/${fish.length} loại · ${mine.points} điểm`);
    const rank = node('ol', 'scoreboard');
    top.forEach((r) => { const li = node('li', r.name === store.players.get(store.selfId)?.name ? 'me' : ''); li.append(node('span', null, r.name), node('b', null, `${r.points}`)); rank.append(li); });
    if (!top.length) rank.append(node('li', 'muted', 'Chưa ai câu được gì'));
    const side = node('div', 'book-side'); side.append(node('h3', null, '🏆 Cần thủ xuất sắc'), rank);
    const main = node('div'); main.append(head, grid);
    body.append(main, side);
    modal.hidden = false;
  });
  return { openBook: () => socket.emit('fish:book') };
}
