import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        // Three.js tách riêng 1 file: ít thay đổi giữa các lần deploy → trình duyệt dùng lại bản đã lưu
        codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': 'http://localhost:3000',
    },
  },
});
