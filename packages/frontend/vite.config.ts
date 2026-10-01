import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/(api|hooks|stores|utils|i18n|events)\//, replacement: path.resolve(__dirname, '../api/src') + '/$1/' },
      { find: '@/token-store', replacement: path.resolve(__dirname, '../api/src/token-store') },
      { find: /^@\/components\//, replacement: path.resolve(__dirname, '../ui/src/components') + '/' },
      { find: '@/lib/utils', replacement: path.resolve(__dirname, '../ui/src/lib/utils') },
      { find: /^@taskora\/ui$/, replacement: path.resolve(__dirname, '../ui/src/index.ts') },
      { find: /^@taskora\/ui\//, replacement: path.resolve(__dirname, '../ui/src') + '/' },
      { find: /^@taskora\/api$/, replacement: path.resolve(__dirname, '../api/src/index.ts') },
      { find: /^@taskora\/api\//, replacement: path.resolve(__dirname, '../api/src') + '/' },
      { find: '@taskora/shared', replacement: path.resolve(__dirname, '../shared/src') },
      { find: /^@taskora\/engine$/, replacement: path.resolve(__dirname, '../engine/src/index.ts') },
      { find: /^@taskora\/engine\//, replacement: path.resolve(__dirname, '../engine/src') + '/' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    port: 5173,
  },
  // SQLite WASM（web Local Replica）：自带 .wasm 按 import.meta.url 定位，
  // 不能被预构建改写路径；worker 以 ES module 打包（sqlite.worker.ts）。
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  build: {
    // 字体分片按 unicode-range 惰性加载（见 @taskora/ui 的 tokens.css）：被内联成
    // base64 会让它随 CSS 无条件下载，破坏按需加载且体积 +33%。woff2 一律独立输出。
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'i18n-vendor': ['react-i18next', 'i18next'],
          'dnd-vendor': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        },
      },
    },
  },
});
