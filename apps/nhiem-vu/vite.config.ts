import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Ứng dụng chạy tại https://<tên-miền>/nhiem-vu/
// Bản build được xuất thẳng ra thư mục /nhiem-vu ở gốc repo để Vercel phục vụ như file tĩnh.
export default defineConfig({
  base: '/nhiem-vu/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, '../../nhiem-vu'),
    emptyOutDir: true,
  },
})
