/**
 * 托盘文案跟随 App 语言：悬停提示（全平台）与 Linux 原生菜单项由 Rust 侧
 * 持有，主窗口启动及切换语言时经 `tray_set_labels` 同步（见
 * src-tauri/src/tray_menu.rs）。不在 Tauri 下（vitest / 浏览器）静默失败。
 */
import { invoke } from '@tauri-apps/api/core';
import { i18n } from '@taskora/api';

function sync() {
  const t = i18n.getFixedT(i18n.language, 'tray');
  void invoke('tray_set_labels', {
    tooltip: t('tooltip'),
    show: t('show'),
    newTask: t('newTask'),
    quit: t('quit'),
  }).catch(() => undefined);
}

/** 安装监听；返回清理函数。 */
export function installTrayLabels(): () => void {
  i18n.on('languageChanged', sync);
  if (i18n.isInitialized) sync();
  else i18n.on('initialized', sync);
  return () => {
    i18n.off('languageChanged', sync);
    i18n.off('initialized', sync);
  };
}
