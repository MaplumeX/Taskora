import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri expects a fixed dev port & no clearing of the console.
// Port 1421: 1420 belongs to the desktop shell — both can run side by side.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Android System WebView (Chromium 105+); keep in sync with desktop.
    target: 'chrome105',
    minify: process.env.TAURI_ENV_DEBUG ? false : true,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
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
