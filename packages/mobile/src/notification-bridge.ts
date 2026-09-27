import { invoke } from '@tauri-apps/api/core';
import { Importance, type Channel, type Options } from '@tauri-apps/plugin-notification';

/**
 * notification 2.4.0 的 channels() 使用 listChannels，但默认 ACL 只允许
 * list_channels。Tauri 在 ACL 检查后才转换原生命令名，不能直接用前者。
 */
export function listNotificationChannels(): Promise<Channel[]> {
  return invoke<Channel[]>('plugin:notification|list_channels');
}

/**
 * 不使用插件缓存的 window.Notification.permission：系统授权可在本会话内
 * 被用户撤回/恢复，必须实时查询（status-bar / reminders 同一口径）。
 */
export async function isNativeNotificationPermissionGranted(): Promise<boolean> {
  try {
    return (await invoke<boolean | null>('plugin:notification|is_permission_granted')) === true;
  } catch {
    return false;
  }
}

/**
 * 请求权限后不使用插件返回值（插件依赖同一个 web 缓存），实时复查原生
 * 权限；回调到达但缓存未更新时不再误认为已授权。
 */
export async function requestNativeNotificationPermission(): Promise<boolean> {
  try {
    const { requestPermission } = await import('@tauri-apps/plugin-notification');
    await requestPermission();
  } catch {
    // 请求失败后复查（也可能在用户拒绝后返回 false）
  }
  return isNativeNotificationPermissionGranted();
}

/**
 * Android 8+ 渠道语义：不存在时创建；渠道被用户关闭时抛错（尝试恢复
 * 旧渠道不成立，渠道重要性只能由用户改）。
 */
export async function ensureNotificationChannel(
  id: string,
  name: string,
  importance: Importance,
): Promise<void> {
  const existing = await listNotificationChannels();
  const channel = existing.find((candidate) => candidate.id === id);
  if (channel?.importance === Importance.None) {
    throw new Error('channel is disabled');
  }
  if (!channel) {
    const { createChannel } = await import('@tauri-apps/plugin-notification');
    await createChannel({ id, name, importance });
  }
}

/**
 * 插件的 sendNotification() 返回 void，内部 Notification 构造函数丢弃
 * 异步 notify 结果。直接等待同一命令，让调用方能捕获原生发布失败。
 */
export function postNotification(options: Options): Promise<void> {
  return invoke('plugin:notification|notify', { options });
}
