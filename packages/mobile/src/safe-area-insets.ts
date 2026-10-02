/**
 * 系统栏安全区：edge-to-edge 下内容铺到状态栏 / 手势条后面，而部分
 * Android WebView 的 `env(safe-area-inset-*)` 仍为 0。background 插件从
 * WindowInsets 读取真实高度，这里写进 `--native-safe-top/bottom`；ui 的
 * `--safe-area-top/bottom`（tokens.css）取它与 env() 的较大者。
 *
 * 启动时取一次（insets 往往在 JS 就绪前已分发），之后变化（旋转、切换
 * 手势导航）经 `insets` 事件推送。不在 Tauri 下（vitest / 浏览器）静默跳过。
 */

import { addPluginListener, invoke } from '@tauri-apps/api/core';

interface SafeAreaInsets {
  top: number;
  bottom: number;
}

function apply({ top, bottom }: SafeAreaInsets): void {
  const style = document.documentElement.style;
  style.setProperty('--native-safe-top', `${top}px`);
  style.setProperty('--native-safe-bottom', `${bottom}px`);
}

/** 安装监听；返回清理函数（测试与热替换用）。 */
export async function installSafeAreaInsets(): Promise<() => void> {
  try {
    const handle = await addPluginListener<SafeAreaInsets>('background', 'insets', apply);
    apply(await invoke<SafeAreaInsets>('plugin:background|safe_area_insets'));
    return () => {
      void handle.unregister().catch(() => undefined);
      document.documentElement.style.removeProperty('--native-safe-top');
      document.documentElement.style.removeProperty('--native-safe-bottom');
    };
  } catch {
    return () => undefined;
  }
}
