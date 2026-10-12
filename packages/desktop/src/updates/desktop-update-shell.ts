import { invoke } from '@tauri-apps/api/core';

import type { UpdateShell } from '@taskora/api';

import { flushBeforeRestart } from '../engine/desktop-engine';

/**
 * 桌面端更新平台壳（ADR-0026）：下载、验签与安装在壳层（src-tauri/src/updater.rs），
 * 目标版本由所连 hub 决定。
 */
export const desktopUpdateShell: UpdateShell = {
  action: 'restart',
  prepare: (version) => invoke<boolean>('update_prepare', { version }),
  async apply(version) {
    // 重启前把 Outbox 推给 hub：本地写入已在 SQLite 里，这里只是让其他设备
    // 不必等本机升级完才看到。
    await flushBeforeRestart();
    await invoke('update_apply', { version });
  },
};
