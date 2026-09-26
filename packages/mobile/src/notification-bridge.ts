import { invoke } from '@tauri-apps/api/core';
import type { Channel, Options } from '@tauri-apps/plugin-notification';

/**
 * notification 2.4.0 的 channels() 使用 listChannels，但默认 ACL 只允许
 * list_channels。Tauri 在 ACL 检查后才转换原生命令名，不能直接用前者。
 */
export function listNotificationChannels(): Promise<Channel[]> {
  return invoke<Channel[]>('plugin:notification|list_channels');
}

/**
 * 插件的 sendNotification() 返回 void，内部 Notification 构造函数丢弃
 * 异步 notify 结果。直接等待同一命令，让调用方能捕获原生发布失败。
 */
export function postNotification(options: Options): Promise<void> {
  return invoke('plugin:notification|notify', { options });
}
