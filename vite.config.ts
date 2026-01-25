import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  // Quan trọng: base './' giúp Electron tìm thấy file css/js khi chạy từ file system
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'), // Sửa thành '.' vì file nằm ngay thư mục gốc, không có thư mục src
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});