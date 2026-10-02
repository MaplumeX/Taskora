/**
 * 状态栏常驻通知的壳（android-status-bar issue 02，滴答清单形态）。
 *
 * issue 02 起改为仓库内 Kotlin 插件 `tauri-plugin-statusbar`：单行
 * RemoteViews 自定义布局（任务名 + 「▸」「＋」大按钮），由 specialUse
 * 前台服务持有；不再使用 tauri-plugin-notification 的标准模板（其按钮
 * 只能出现在系统 action 行，且无自定义布局）。
 *
 * - 发布/撤下：`plugin:statusbar|show` / `plugin:statusbar|cancel`；
 * - 动作回调：插件 trigger('action')，载荷 { action: 'next' }；
 * - 快速添加（quick-add-android issue 01）：浮层提交的草稿 JSON 由原生
 *   入队，这里注册监听后取一次（冷启动时提交早于 JS 就绪），之后每次
 *   收到 quick-add-available 再取；逐条转成 { actionId: 'quick-add' }；
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

      // 原生取出即删，重复取只会拿到空列表，无需在 JS 侧去重。
      const drainQuickAdds = async () => {
        try {
          const items = await invoke<string[]>('plugin:statusbar|take_pending_quick_adds');
          for (const input of items) cb({ actionId: 'quick-add', inputValue: input });
        } catch (error) {
          console.warn('[status-bar] take quick adds failed:', error);
        }
      };
      void addPluginListener('statusbar', 'quick-add-available', () => void drainQuickAdds())
        .then(drainQuickAdds)
        .catch((error) => {
          console.warn('[status-bar] quick-add listener failed:', error);
        });
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
    async notifyQuickAddFailed(content) {
      await invoke('plugin:statusbar|notify_quick_add_failed', {
        args: {
          title: content.title,
          text: content.text,
          channelName: i18n.t('statusbar:quickAddFailedChannelName'),
        },
      });
    },
  };
}

/** 通知点按导航的目标（原生 contentIntent 携带的 extra）。 */
export type StatusBarNavigateDestination = 'today';

/**
 * 取走冷启动时点通知携带的导航目标（取出即删）。点通知拉起进程时 JS
 * 尚未注册事件监听，意图由原生保存在插件实例里，待这里主动取走；
 * App 存活时的点按走 onStatusBarNavigate。
 */
export async function takeStatusBarNavigation(): Promise<StatusBarNavigateDestination | null> {
  try {
    const destination = await invoke<string | null>('plugin:statusbar|take_navigation');
    return destination === 'today' ? 'today' : null;
  } catch (error) {
    console.warn('[status-bar] take navigation failed:', error);
    return null;
  }
}

/**
 * 订阅点通知导航事件（App 存活时 onNewIntent 经 trigger('navigate') 投递）。
 */
export function onStatusBarNavigate(cb: (destination: StatusBarNavigateDestination) => void): void {
  void addPluginListener<{ destination?: string }>('statusbar', 'navigate', (payload) => {
    if (payload.destination === 'today') cb('today');
  }).catch((error) => {
    console.warn('[status-bar] navigate listener failed:', error);
  });
}
