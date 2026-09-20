import { defineConfig } from 'vitest/config';

import path from 'node:path';

// node:sqlite is experimental in Node 22 — silence the warning so test
// output stays readable.
process.removeAllListeners('warning');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@taskora/shared',
        replacement: path.resolve(__dirname, '../shared/src/index.ts'),
      },
    ],
  },
});
