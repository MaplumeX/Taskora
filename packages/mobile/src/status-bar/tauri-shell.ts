/**
 * 状态栏常驻通知的壳（android-status-bar issue 02，滴答清单形态）。
 *
 * issue 02 起改为仓库内 Kotlin 插件 `tauri-plugin-statusbar`：单行
 * RemoteViews 自定义布局（任务名 + 「▸」「＋」大按钮），由 specialUse
 * 前台服务持有；不再使用 tauri-plugin-notification 的标准模板（其按钮
 * 只能出现在系统 action 行，且无自定义布局）。
 *
 * - 发布/撤下：`plugin:statusbar|show` / `plugin:statusbar|cancel`；
 * - 动作回调：插件 trigger('action')，载荷 { action: 'next' } 或
 *   { action: 'quick-add', input }（「＋」拉起 QuickAddActivity 浮层，
 *   提交文本经 input 带回；冷启动输入由原生落盘补发）；
 * - 权限请求走 notification-bridge 的实时原生复查（不缓存 web 权限，
 *   与 reminders 同一口径）；渠道被用户在系统设置关闭时 show 会 reject，
 *   控制器据此回滚开关（issue 01 行为保留）。
 */

import { addPluginListener, invoke } from '@tauri-apps/api/core';
import { i18n } from '@taskora/api';

import type { StatusBarActionEvent, StatusBarShell } from '@taskora/api';
import {
  isNativeNotificationPermissionGranted,
  requestNativeNotificationPermission,
} from '../notification-bridge';

/** 插件 trigger('action') 的载荷（见 StatusBarPlugin.kt）。 */
interface StatusBarActionPayload {
  action?: string;
  input?: string;
}

export function createTauriStatusBarShell(): StatusBarShell {
  return {
    isPermissionGranted: isNativeNotificationPermissionGranted,
    requestPermission: requestNativeNotificationPermission,
    async post(content) {
      await invoke('plugin:statusbar|show', {
        args: {
          title: content.title,
          channelName: i18n.t('statusbar:channelName'),
          quickAddHint: i18n.t('statusbar:quickAddPlaceholder'),
          submitLabel: i18n.t('statusbar:quickAddSubmit'),
        },
      });
    },
    async clear() {
      try {
        await invoke('plugin:statusbar|cancel');
      } catch {
        // 通知/服务不存在时忽略
      }
    },
    onAction(cb) {
      void addPluginListener<StatusBarActionPayload>('statusbar', 'action', (payload) => {
        const event: StatusBarActionEvent = {
          actionId: payload.action ?? 'tap',
          inputValue: payload.input ?? null,
        };
        cb(event);
      }).catch((error) => {
        console.warn('[status-bar] action listener failed:', error);
      });
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
