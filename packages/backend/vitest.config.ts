import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: [],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});