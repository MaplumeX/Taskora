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
    server: {
      deps: {
        // node:sqlite 是内置模块，Vite 不应尝试解析/打包
        external: [/^node:/],
      },
    },
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
