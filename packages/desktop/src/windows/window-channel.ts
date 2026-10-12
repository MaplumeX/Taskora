/**
 * 窗口间的 Engine 通道（ADR-0025）：TabEngine / createEngineHost 用的
 * TabChannel，底层是一个 Tauri 全局事件。消息带发送窗口的 label，各窗口
 * 忽略自己发出的（与 BroadcastChannel 的语义一致）。
 */

import { emit, listen } from '@tauri-apps/api/event';

import type { TabChannel, TabMessage } from '@taskora/api';

export const ENGINE_CHANNEL_EVENT = 'taskora://engine';

/** 主窗口的 label：Engine 的唯一持有者（tauri.conf.json）。 */
export const MAIN_WINDOW = 'main';

interface Envelope {
  from: string;
  /** encodeMessage 编码的 TabMessage。 */
  message: string;
}

/**
 * IPC 载荷走 JSON：数组里的 undefined 会变成 null（BroadcastChannel 的结构化
 * 克隆则原样保留）。Engine 调用的可选参数在参数数组末尾，list(entity) 到了
 * 主窗口就成了 list(entity, null)。数组里的 undefined 用占位符往返；对象里
 * 值为 undefined 的键照常省略（与缺省同义）。
 */
const UNDEFINED = { __undefined: true } as const;

export function encodeMessage(message: TabMessage): string {
  return JSON.stringify(message, function (this: unknown, _key, value: unknown) {
    return value === undefined && Array.isArray(this) ? UNDEFINED : value;
  });
}

export function decodeMessage(raw: string): TabMessage {
  return JSON.parse(raw, (_key, value: unknown) =>
    value !== null &&
    typeof value === 'object' &&
    (value as { __undefined?: unknown }).__undefined === true
      ? undefined
      : value,
  ) as TabMessage;
}

type Listener = (event: MessageEvent<TabMessage>) => void;

export function createWindowChannel(self: string): TabChannel & { close(): void } {
  const listeners = new Set<Listener>();
  let unlisten: (() => void) | null = null;
  let closed = false;
  // 监听挂好之前不发消息：ping 的应答（hello）不能早于监听到达。
  const ready = listen<Envelope>(ENGINE_CHANNEL_EVENT, (event) => {
    if (event.payload.from === self) return;
    const message = { data: decodeMessage(event.payload.message) } as MessageEvent<TabMessage>;
    listeners.forEach((listener) => listener(message));
  }).then(
    (fn) => {
      if (closed) fn();
      else unlisten = fn;
    },
    (error: unknown) => {
      console.warn('[windows] Engine 通道监听失败', error);
      closed = true;
    },
  );

  return {
    postMessage(message) {
      void ready
        .then(() => {
          if (closed) return;
          return emit<Envelope>(ENGINE_CHANNEL_EVENT, {
            from: self,
            message: encodeMessage(message),
          });
        })
        .catch((error: unknown) => console.warn('[windows] Engine 通道发送失败', error));
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
      unlisten?.();
      unlisten = null;
    },
  };
}
