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
