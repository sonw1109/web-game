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
    s.once('connect', () => { s.off('connect_error', onErr); socket = s; resolve(s); });
    s.on('connect_error', onErr);
  });
}
