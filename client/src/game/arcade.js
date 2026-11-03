// 🕹️ Khu Trò Chơi: danh sách các phòng game nhỏ bên trong 1 tòa nhà.
// Module thuần (không cần trình duyệt) – server cũng import để biết tên phòng hợp lệ.
export const ARCADE_ID = 'arcade';

/**
 * id: tên phòng (cũng là tiền tố sự kiện socket `${id}:…`)
 * cat: nhóm hiển thị trong sảnh · players: gợi ý số người · bot: có nút "Chơi với bot"
 * color: màu thảm/đèn của phòng 3D
 */
export const ARCADE_GAMES = [
  { id: 'chess', name: 'Cờ Vua', icon: '♟️', cat: 'Cờ', players: '2 người', bot: true, color: '#7a4b2a', desc: 'Đủ luật: nhập thành, bắt tốt qua đường, phong cấp. Có bot đánh cùng.' },
  { id: 'sudoku', name: 'Sudoku Hợp Sức', icon: '🔢', cat: 'Giải đố', players: 'Cả nhóm', bot: false, color: '#2f6fb0', desc: 'Cả phòng cùng giải 1 bảng – điền đúng được điểm, sai bị trừ.' },
  { id: 'mines', name: 'Dò Mìn Đồng Đội', icon: '💣', cat: 'Giải đố', players: 'Cả nhóm', bot: false, color: '#4d7c3a', desc: 'Cùng nhau mở ô, cắm cờ. Một người dẫm mìn là cả đội nổ!' },
  { id: 'riddle', name: 'Đố Mẹo', icon: '🧠', cat: 'Giải đố', players: 'Cả nhóm', bot: true, color: '#8e44ad', desc: 'Câu đố mẹo dân gian – ai trả lời đúng nhanh nhất được nhiều điểm.' },
  { id: 'memory', name: 'Lật Hình', icon: '🃏', cat: 'Vui nhộn', players: '2–6 người', bot: true, color: '#c0392b', desc: 'Lần lượt lật 2 thẻ, trùng hình thì được điểm và lật tiếp.' },
  { id: 'rps', name: 'Oẳn Tù Tì', icon: '✊', cat: 'Vui nhộn', players: 'Cả nhóm', bot: true, color: '#d35400', desc: 'Mỗi vòng 8 giây: búa – kéo – bao. Thắng ai được điểm người đó.' },
  { id: 'g2048', name: '2048', icon: '🔷', cat: 'Một mình', players: '1 người', bot: false, color: '#b8860b', desc: 'Gộp số tới 2048. Điểm được server kiểm tra lại, lên Bảng Vàng.' },
];

export const ARCADE_IDS = ARCADE_GAMES.map((g) => g.id);
export const gameById = (id) => ARCADE_GAMES.find((g) => g.id === id);
