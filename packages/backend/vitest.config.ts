import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // esbuild (vitest's default transformer) does not emit
    // `design:paramtypes`, which silently breaks Nest constructor DI in
    // tests. SWC with emitDecoratorMetadata keeps DI working.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    setupFiles: [],
    // DB-backed specs (resetDb) share one test database — files must not
    // run in parallel or they truncate each other's fixtures.
    fileParallelism: false,
  },
});
