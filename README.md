# 🏮 Hội Quán

Thế giới 3D (Three.js) cho hội bạn: đi lại, chat, emoji, xem YouTube đồng bộ. Kế hoạch: [docs/PLAN.md](docs/PLAN.md).

## Chạy local
```bash
npm install
npm run dev        # server :3000 + Vite :5173 → mở http://localhost:5173
```
Mật khẩu mặc định: `hoiquan` (đổi bằng biến môi trường `APP_PASSWORD`).

Mở 2 tab (hoặc 1 tab ẩn danh) để thấy nhau.

| Phím | Tác dụng |
|---|---|
| WASD / mũi tên | Đi lại |
| E | Vào phòng khi đứng trước cửa |
| Enter | Chat · Esc để thoát ô chat |
| 1–6 | Thả emoji |
| 7 8 9 0 | Hành động: nhảy, cúi chào, vẫy tay, xoay vòng |
| F (hoặc nút 🎆) | Bắn pháo hoa cho cả sảnh xem |
| P (hoặc nút 📸) | Chụp ảnh – tải về hoặc treo lên Phòng Tranh |
| E ở ven hồ / trên bến | Câu cá 🎣 (cá cắn câu thì nhấn E thật nhanh) |
| E trước vòng quay (cạnh đài phun nước) | 🎡 Quay "Hôm nay ăn gì?" – 20 món Việt ba miền |
| Chat `/mua` `/nang` `/tuyet` `/hoadao` | Đổi thời tiết cả sảnh (`/help` để xem) |
| Chạm / click bản đồ | Đi tới chỗ đó (điện thoại) |
| Kéo chuột (trái/phải) · vuốt 1 ngón | Xoay camera, nhìn ra sau lưng (sảnh, phòng tranh) — WASD đi theo hướng camera |
| Lăn chuột / phím + − · chụm 2 ngón | Phóng to / thu nhỏ camera |
| ⚙️ | Chất lượng đồ họa: Tự động / Cao / Trung bình / Thấp |
| Space (trong rạp) | Phát / dừng cho cả phòng |
| 1–4 hoặc A–D (Quiz) | Chọn đáp án |
| Ctrl+Z (Vẽ) | Hoàn tác nét vẽ |
| Esc | Rời phòng |

## Các phòng
- 🎬 **Rạp phim** – dán link YouTube, cả phòng xem đồng bộ, có hàng chờ.
- ⭕ **Quán Caro** – bàn 15×15, 5 ô thắng, 30s/nước; người thứ 3 trở đi vào xem.
- 🎨 **Phòng Vẽ** – cần ≥2 người. Đoán bằng cách gõ vào ô chat (không cần dấu).
- ❓ **Phòng Quiz** – 10 câu ngẫu nhiên từ `server/data/quiz-vi.json`, thêm câu tùy ý.
- 🖼️ **Phòng Tranh** – 8 bệ trưng bày xoay (ảnh mới nhất) + 30 chỗ trên tường; treo ảnh chung (chọn nhiều ảnh / kéo-thả), thả tim, xem lớn, trình chiếu; 6 chế độ đèn đồng bộ cả phòng (Bảo tàng, Neon, Disco, Hoàng hôn, Sao đêm, Tắt đèn – soi đèn pin). Ảnh lưu ở `GALLERY_DIR` (mặc định thư mục tạm của máy).
- ⌨️ **Đua Gõ Phím** – gõ câu ca dao (có dấu hay không dấu đều được), nhân vật chạy trên đường đua theo tốc độ gõ.
- 🎲 **Sòng Bầu Cua** – đặt cược bằng điểm (1000 điểm khởi đầu), bát úp lắc, xúc xắc 3D. Chơi cho vui, không dùng tiền thật.
- 🌗 Sảnh đổi ngày/đêm theo giờ Việt Nam.
- 🗺️ Bản đồ rộng hơn: 🎣 Hồ câu cá (có bến gỗ, sổ tay sưu tập 14 loại + bảng xếp hạng), 🌸 Vườn hoa đào, 🏯 Công viên chòi nghỉ. Bản đồ nhỏ góc trên-trái: bấm khu vực để dịch chuyển.
- 🎡 Vòng quay **Hôm nay ăn gì?** cạnh đài phun nước: 20 món tiêu biểu ba miền (`server/data/foods-vi.json`, sửa/thêm món thoải mái), cả sảnh cùng xem quay, kết quả báo lên chat.
- 🌦️ Thời tiết chung cho cả server (nắng / mưa / hoa đào / tuyết, tự đổi mỗi 5–8 phút).
- 🐾 Thú cưng đi theo (chọn khi tạo nhân vật): mèo, cún, gà con, thỏ.
- 🎙️ Trong mọi phòng: bật mic/cam ở thanh trên cùng (mặc định tắt), bấm vào ô cam để phóng to.

Muốn thêm từ cho Vẽ & Đoán: sửa `server/data/words-vi.json`.

🤖 **Bot chơi cùng:** trong phòng game bấm **🤖 Chơi với bot** để mời bot (bấm lần nữa để mời ra); bot tự về khi phòng hết người. Tắt hẳn: env `BOTS=off`.

👑 **Admin:** đã có sẵn mật khẩu admin dựng trong code (chỉ lưu mã băm scrypt, repo công khai không lộ mật khẩu – hỏi chủ server). Muốn đổi: đặt biến môi trường `ADMIN_PASSWORD` (được ưu tiên). Khi chạy local gõ `admin` cũng được. Đăng nhập: nút ⚙️ → 🔑 Đăng nhập admin, hoặc gõ `/admin <mật khẩu>` trong chat (mật khẩu không hiện cho người khác). Admin có 👑 trước tên; trong Sòng Bầu Cua có nút +100 / +500 / +1k / ✎ (nhập số, âm để trừ) và tặng cả bàn. Thoát: nút "Thoát admin" hoặc `/admin off`.

📱 **Caro trên điện thoại:** đang chơi tự phóng to bàn cờ (nhìn từ trên xuống), chụm 2 ngón để zoom, kéo để di chuyển; chạm 1 lần xem trước, chạm lần 2 để đặt quân.

## Deploy lên Render (miễn phí)
1. Đẩy code lên GitHub (repo private cũng được).
2. Vào https://dashboard.render.com → **New → Blueprint** → chọn repo. Render đọc [render.yaml](render.yaml).
3. Nhập `APP_PASSWORD`. Bấm Apply, đợi build ~2–3 phút, nhận link `https://hoi-quan-xxxx.onrender.com`.
4. (Nên làm) Voice/cam qua 4G hay mạng công ty thường cần **TURN**: đăng ký free tại metered.ca → mục TURN Server lấy URL/username/credential → điền `TURN_URLS` (nhiều URL cách nhau dấu phẩy), `TURN_USERNAME`, `TURN_CREDENTIAL`.

> Render free ngủ sau 15 phút không ai vào; lần đầu mở lại chờ ~30–50s. Trạng thái phòng giữ trong RAM nên restart là reset.

## Lệnh khác
```bash
npm run build && npm start   # chạy bản production local trên $PORT (mặc định 3000)
npm test                     # unit test logic server (cinema, caro, vẽ-đoán, quiz)
```

## Tiến độ
- [x] 1. Nền tảng · [x] 2. Nhân vật & bản đồ · [x] 3. Rạp phim · [x] 4. Voice/Video
- [x] 5. Caro · [x] 6. Vẽ & Đoán · [x] 7. Quiz · [x] 8. Polish (âm thanh, responsive, chạm để đi) & cấu hình deploy
- [ ] Deploy thật lên Render (cần tài khoản GitHub/Render của bạn)
