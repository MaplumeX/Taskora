import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: [
      { find: /^@\/(api|hooks|stores|utils|i18n)\//, replacement: path.resolve(__dirname, '../api/src') + '/$1/' },
      { find: '@/token-store', replacement: path.resolve(__dirname, '../api/src/token-store') },
      { find: /^@taskora\/ui$/, replacement: path.resolve(__dirname, '../ui/src/index.ts') },
      { find: /^@taskora\/ui\//, replacement: path.resolve(__dirname, '../ui/src') + '/' },
      { find: /^@taskora\/api$/, replacement: path.resolve(__dirname, '../api/src/index.ts') },
      { find: /^@taskora\/api\//, replacement: path.resolve(__dirname, '../api/src') + '/' },
      { find: /^@\/components\//, replacement: path.resolve(__dirname, '../ui/src/components') + '/' },
      { find: '@/lib/utils', replacement: path.resolve(__dirname, '../ui/src/lib/utils') },
      { find: '@taskora/shared', replacement: path.resolve(__dirname, '../shared/src') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
});