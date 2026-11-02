// ⌨️ Đua Gõ Phím: cùng gõ 1 câu tiếng Việt, ai xong trước thắng. Gõ có dấu hay không dấu đều được.
import { randomInt } from 'node:crypto';

export const TEXTS = [
  'Có công mài sắt, có ngày nên kim. Kiên nhẫn từng chút một rồi việc khó mấy cũng xong.',
  'Ăn quả nhớ kẻ trồng cây, uống nước nhớ nguồn. Biết ơn là điều làm nên con người tử tế.',
  'Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi cao. Hội bạn mình cũng vậy đó.',
  'Đi một ngày đàng, học một sàng khôn. Mỗi chuyến đi đều mang về một bài học thú vị.',
  'Gần mực thì đen, gần đèn thì rạng. Chơi với bạn tốt thì mình cũng tốt lên mỗi ngày.',
  'Tốt gỗ hơn tốt nước sơn. Vẻ ngoài chỉ là một phần, cái đẹp thật nằm ở bên trong.',
  'Uốn cây từ thuở còn non, dạy con từ thuở con còn bi bô. Thói quen tốt bắt đầu từ sớm.',
  'Thương người như thể thương thân. Giúp nhau lúc khó khăn mới là bạn bè thật sự.',
  'Muốn biết phải hỏi, muốn giỏi phải học. Không ai sinh ra đã biết hết mọi thứ cả.',
  'Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau. Nói nhẹ nhàng thì ai cũng vui.',
  'Chiều nay cả hội rủ nhau đi ăn phở, uống trà sữa rồi về xem phim tới tận khuya.',
  'Trời hôm nay trong xanh, gió mát, rất hợp để đạp xe quanh hồ và chụp vài tấm ảnh đẹp.',
  'Muốn đi nhanh hãy đi một mình, muốn đi xa hãy đi cùng nhau. Cảm ơn vì đã luôn ở đây.',
  'Cuối tuần này mình tổ chức tiệc nướng ở sân thượng, nhớ mang theo đàn và thật nhiều tiếng cười.',
];
export const COUNTDOWN_MS = 4_000, RACE_MS = 120_000, OVER_MS = 0;
export const MAX_CPS = 30; // nhanh hơn 30 ký tự/giây là bất thường → chặn

/** Chuẩn hóa để so: bỏ dấu, đ→d, chữ thường. */
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
/** Số ký tự gõ đúng liên tiếp từ đầu (so không dấu). */
export function correctPrefix(target, typed) {
  const a = fold(target), b = fold(typed);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
export const wpm = (chars, ms) => (ms > 0 ? Math.round((chars / 5) / (ms / 60000)) : 0);

export function registerTyping(io, world) {
  const ROOM = 'room:typing';
  const g = { phase: 'idle', text: '', startAt: 0, deadline: 0, racers: new Map(), finishOrder: 0, results: null };
  const members = () => world.inRoom('typing');
  const sys = (text) => io.to(ROOM).emit('chat:message', { system: true, text, ts: Date.now() });

  const view = () => ({
    phase: g.phase,
    text: g.phase === 'idle' ? '' : g.text,
    remainingMs: Math.max(0, g.deadline - Date.now()),
    startInMs: g.phase === 'countdown' ? Math.max(0, g.startAt - Date.now()) : 0,
    racers: [...g.racers.values()].map((r) => ({ ...r, name: world.get(r.id)?.name ?? r.name })),
    results: g.results,
  });
  const broadcast = () => io.to(ROOM).emit('typing:state', view());

  function start(id) {
    if (world.get(id)?.room !== 'typing' || !['idle', 'over'].includes(g.phase)) return;
    g.text = TEXTS[randomInt(TEXTS.length)];
    g.phase = 'countdown';
    g.startAt = Date.now() + COUNTDOWN_MS;
    g.deadline = g.startAt + RACE_MS;
    g.racers = new Map(members().map((p) => [p.id, { id: p.id, name: p.name, bot: !!p.bot, progress: 0, finishedMs: 0, wpm: 0, place: 0 }]));
    g.finishOrder = 0;
    g.results = null;
    sys(`⌨️ ${world.get(id).name} bắt đầu cuộc đua gõ phím (${g.racers.size} người)!`);
    broadcast();
  }

  function finish() {
    g.phase = 'over';
    g.results = [...g.racers.values()].sort((a, b) => (a.place || 99) - (b.place || 99) || b.progress - a.progress)
      .map((r) => ({ id: r.id, name: world.get(r.id)?.name ?? r.name, wpm: r.wpm, finished: !!r.finishedMs, progress: r.progress }));
    const w = g.results[0];
    if (w?.finished) sys(`🏁 ${w.name} về nhất với ${w.wpm} từ/phút!`);
    broadcast();
  }

  function progress(id, n) {
    const r = g.racers.get(id);
    if (g.phase !== 'racing' || !r || r.finishedMs) return;
    const len = fold(g.text).length;
    const elapsed = Date.now() - g.startAt;
    n = Math.max(r.progress, Math.min(len, Math.floor(Number(n) || 0), Math.ceil((elapsed / 1000) * MAX_CPS) + 3));
    r.progress = n;
    r.wpm = wpm(n, elapsed);
    if (n >= len) {
      r.finishedMs = elapsed;
      r.place = ++g.finishOrder;
      sys(`🏁 ${world.get(id)?.name} về đích thứ ${r.place} – ${r.wpm} từ/phút`);
      if ([...g.racers.values()].every((x) => x.finishedMs || !world.get(x.id) || world.get(x.id).room !== 'typing')) return finish();
    }
    broadcast();
  }

  io.on('connection', (socket) => {
    socket.on('typing:sync', () => world.get(socket.id)?.room === 'typing' && socket.emit('typing:state', view()));
    socket.on('typing:start', () => start(socket.id));
    socket.on('typing:progress', (n) => progress(socket.id, n));
  });

  world.events.on('room', ({ p, room, prev }) => {
    if (room !== 'typing' && prev !== 'typing') return;
    if (prev === 'typing' && g.phase !== 'idle' && !members().some((m) => !m.bot)) { g.phase = 'idle'; g.racers.clear(); }
    broadcast();
    void p;
  });

  setInterval(() => {
    if (g.phase === 'countdown' && Date.now() >= g.startAt) { g.phase = 'racing'; broadcast(); }
    else if (g.phase === 'racing' && Date.now() >= g.deadline) finish();
  }, 200);

  return { g, progress, start, len: () => fold(g.text).length };
}
