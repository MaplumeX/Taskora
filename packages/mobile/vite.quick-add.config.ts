import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';

import baseConfig from './vite.config';

/**
 * 状态栏快速添加浮层（src/quick-add）的独立构建：产物进 statusbar 插件的
 * Android assets，由 QuickAddActivity 的 WebView 经 WebViewAssetLoader 加载
 * （https://appassets.androidplatform.net/assets/quick-add/quick-add.html）。
 * 浮层不在 Tauri 的主 WebView 里，读不到 Tauri 内嵌的前端资源，所以单独打包。
 *
 * 产物不入库（.gitignore），`pnpm build:vite` / `pnpm dev` 会先构建它。
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    base: './',
    publicDir: false,
    build: {
      outDir: path.resolve(__dirname, 'plugins/statusbar/android/src/main/assets/quick-add'),
      emptyOutDir: true,
      rollupOptions: { input: path.resolve(__dirname, 'quick-add.html') },
    },
    resolve: {
      // 不再打包一份 Noto Sans SC（约 4MB），原因见 src/quick-add/no-font.css。
      alias: [
        {
          find: '@fontsource-variable/noto-sans-sc',
          replacement: path.resolve(__dirname, 'src/quick-add/no-font.css'),
        },
      ],
    },
  }),
);
