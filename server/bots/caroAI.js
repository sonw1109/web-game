// AI Caro đơn giản: chấm điểm từng ô trống theo chuỗi tấn công + phòng thủ.
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** Điểm của 1 chuỗi theo độ dài và số đầu còn mở. */
function lineScore(count, open) {
  if (count >= 5) return 10_000_000;
  if (open === 0) return 0;
  const table = {
    4: [0, 20_000, 200_000],
    3: [0, 800, 15_000],
    2: [0, 60, 500],
    1: [0, 5, 20],
  };
  return table[count][open];
}

/** Nếu `who` đánh vào ô (x,y) thì tạo được thế mạnh cỡ nào. */
function evaluate(board, size, x, y, who) {
  let total = 0;
  for (const [dx, dy] of DIRS) {
    let count = 1, open = 0;
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (cx >= 0 && cy >= 0 && cx < size && cy < size && board[cy * size + cx] === who) { count++; cx += dx * s; cy += dy * s; }
      if (cx >= 0 && cy >= 0 && cx < size && cy < size && board[cy * size + cx] === '') open++;
    }
    total += lineScore(count, open);
  }
  return total;
}

/** Chọn nước đi tốt nhất cho `me` ('X' | 'O'). Trả về chỉ số ô. */
export function bestMove(board, me, size = 15, rand = Math.random) {
  const opp = me === 'X' ? 'O' : 'X';
  if (board.every((v) => !v)) return Math.floor(size / 2) * size + Math.floor(size / 2);
  let best = -1, bestScore = -Infinity;
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue;
    const x = i % size, y = Math.floor(i / size);
    // chỉ xét ô gần quân đã có (bán kính 2) cho nhanh
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size && board[ny * size + nx]) near = true;
    }
    if (!near) continue;
    const score = evaluate(board, size, x, y, me) * 1.1 + evaluate(board, size, x, y, opp) + rand() * 3;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
