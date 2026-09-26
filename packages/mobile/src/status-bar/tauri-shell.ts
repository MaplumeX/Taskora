/**
 * 状态栏常驻通知的 Tauri 薄壳（android-status-bar，滴答清单形态）：
 * tauri-plugin-notification 的适配层，与 reminders 的
 * tauri-notification-shell 同一模式。
 *
 * 形态：折叠态单行 ongoing 通知，标题 = 当前任务；两个 action：
 * - 「next」（>）：切换下一条（控制器轮播游标）；
 * - 「quick-add」（+）：通知内输入（RemoteInput）。
 *
 * 实现要点（均见插件 Kotlin 源码与 research.md）：
 * - LOW 渠道：无声、无震动，但状态栏有图标；
 * - ongoing + 固定 id：覆盖式更新；
 * - 动作组经 NotificationStorage 持久化：App 冷启动后通知上的按钮
 *   依然可用（点按拉起 Activity 并回放 actionPerformed）；
 * - 动作回调原始载荷 { inputValue, actionId, notification }，actionId
 *   'tap' 为点按本体、'dismiss' 为划掉。
 */

import { invoke } from '@tauri-apps/api/core';
import {
  cancel,
  createChannel,
  onAction,
  registerActionTypes,
  requestPermission,
  Importance,
} from '@tauri-apps/plugin-notification';
import { i18n } from '@taskora/api';

import type { StatusBarActionEvent, StatusBarShell } from '@taskora/api';
import { listNotificationChannels, postNotification } from '../notification-bridge';

const CHANNEL_ID = 'status-bar';
const ACTION_TYPE_ID = 'taskora-status-bar';
const QUICK_ADD_ACTION_ID = 'quick-add';
const NEXT_ACTION_ID = 'next';
/** 固定通知 id：覆盖式更新与登出撤下都命中同一条系统通知。 */
const NOTIFICATION_ID = 620001;

/** 每次检查渠道，才能感知用户在系统设置中关闭/恢复渠道。 */
async function ensureChannel(): Promise<void> {
  const existing = await listNotificationChannels();
  const channel = existing.find((channel) => channel.id === CHANNEL_ID);
  if (channel?.importance === Importance.None) {
    throw new Error('status bar notification channel is disabled');
  }
  if (!channel) {
    await createChannel({
      id: CHANNEL_ID,
      name: i18n.t('statusbar:channelName'),
      importance: Importance.Low,
    });
  }
}

/** 插件 onAction 原始载荷（d.ts 标为 Options，实际见 Kotlin 源码）。 */
interface RawActionPayload {
  inputValue?: string | null;
  actionId?: string;
}

export function createTauriStatusBarShell(): StatusBarShell {
  let actionListenerReady: Promise<unknown> | null = null;
  let actionTypesReady: Promise<void> | null = null;

  /** 动作组成功后复用；失败不缓存，下次发布重试。 */
  function ensureActionTypes(): Promise<void> {
    actionTypesReady ??= registerActionTypes([
      {
        id: ACTION_TYPE_ID,
        actions: [
          { id: NEXT_ACTION_ID, title: i18n.t('statusbar:nextTask') },
          {
            id: QUICK_ADD_ACTION_ID,
            title: i18n.t('statusbar:quickAdd'),
            input: true,
            inputPlaceholder: i18n.t('statusbar:quickAddPlaceholder'),
          },
        ],
      },
    ]).catch((error) => {
      actionTypesReady = null;
      throw error;
    });
    return actionTypesReady;
  }

  return {
    async isPermissionGranted() {
      try {
        // 不使用插件缓存的 window.Notification.permission：系统授权可在
        // 本会话内被用户撤回/恢复。
        return (await invoke<boolean | null>('plugin:notification|is_permission_granted')) === true;
      } catch {
        return false;
      }
    },
    async requestPermission() {
      try {
        return (await requestPermission()) === 'granted';
      } catch {
        return false;
      }
    },
    async post(content) {
      await ensureChannel();
      await ensureActionTypes();
      await postNotification({
        id: NOTIFICATION_ID,
        channelId: CHANNEL_ID,
        title: content.title,
        ongoing: true,
        actionTypeId: ACTION_TYPE_ID,
        autoCancel: false,
        // Android 静默由 LOW 渠道保证（silent 仅 iOS 生效）。
      });
    },
    async clear() {
      try {
        await cancel([NOTIFICATION_ID]);
      } catch {
        // 无对应通知时忽略
      }
    },
    onAction(cb) {
      // 系统监听只注册一次，转发给最近的业务回调。
      actionListenerReady ??= onAction((payload) => {
        const raw = payload as unknown as RawActionPayload;
        const event: StatusBarActionEvent = {
          actionId: raw.actionId ?? 'tap',
          inputValue: raw.inputValue ?? null,
        };
        cb(event);
      });
      void actionListenerReady.catch((error) => {
        actionListenerReady = null;
        console.warn('[status-bar] action listener failed:', error);
      });
    },
    async openSettings() {
      await invoke('open_notification_settings');
    },
  };
}
