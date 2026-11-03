import { io } from 'socket.io-client';

/** @type {import('socket.io-client').Socket | null} */
export let socket = null;

/** Kết nối tới server với mật khẩu chung. Resolve khi kết nối thành công. */
export function connect(password) {
  return new Promise((resolve, reject) => {
    socket?.disconnect();
    const s = io({ auth: { password }, reconnectionDelayMax: 4000 });
    const onErr = (err) => {
      if (err.message === 'WRONG_PASSWORD') {
        s.disconnect();
        reject(new Error('Sai mật khẩu rồi 😅'));
      } else if (!s.active) {
        reject(new Error('Không kết nối được server'));
      }
      // các lỗi tạm thời khác: socket.io tự thử lại
    };
    s.once('connect', () => {
      s.off('connect_error', onErr);
      socket = s;
      // mật khẩu chung bị đổi khi đang chơi → kết nối lại sẽ bị từ chối mãi: quên mật khẩu cũ, tải lại để nhập mới
      s.on('connect_error', (err) => {
        if (err.message !== 'WRONG_PASSWORD') return;
        try { localStorage.removeItem('hoiquan.password'); } catch {}
        location.reload();
      });
      resolve(s);
    });
    s.on('connect_error', onErr);
  });
}
