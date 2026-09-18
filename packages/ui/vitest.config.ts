import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/polyfill.ts', './src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: [
      { find: /^@\/(api|hooks|stores|utils|i18n|events)\//, replacement: path.resolve(__dirname, '../api/src') + '/$1/' },
      { find: '@/token-store', replacement: path.resolve(__dirname, '../api/src/token-store') },
      { find: '@taskora/api', replacement: path.resolve(__dirname, '../api/src') },
      { find: '@taskora/shared', replacement: path.resolve(__dirname, '../shared/src') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});
