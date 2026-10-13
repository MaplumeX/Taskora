import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/src-tauri/target/**',
      '**/src-tauri/gen/**',
      '.pi/**',
      '.trellis/**',
      '.codex/**',
      '.agents/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // packages/ui 的源码也在 desktop / mobile / frontend 里编译，那里的 `@/*` 指向各自的
  // src，只把下面这些前缀转发回 ui / api（见各包 tsconfig paths 与 vite alias）。
  // 其余 `@/` 导入在 ui 包内能过、到 app 包才报 TS2307，故在 ui 里直接拦下。
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', 'packages/ui/src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^@/(?!(components|api|events|hooks|stores|utils)/|lib/utils$|token-store$|i18n/config$)',
              message:
                'ui 源码会在 desktop / mobile / frontend 里编译，那里的 `@/` 只转发 @/components/*、@/lib/utils 及 api 前缀；请改用相对路径（如 ../../lib/dnd）。',
            },
          ],
        },
      ],
    },
  },
  // 根级 Node 脚本（scripts/）：非 TS 包，无 Node 全局类型声明
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
);
