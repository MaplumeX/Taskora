import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port & no clearing of the console.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'chrome105',
    minify: process.env.TAURI_ENV_DEBUG ? false : true,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // 字体分片按 unicode-range 惰性加载（见 @taskora/ui 的 tokens.css）：被内联成
    // base64 会让它随 CSS 无条件下载，破坏按需加载且体积 +33%。woff2 一律独立输出。
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
  },
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
});
