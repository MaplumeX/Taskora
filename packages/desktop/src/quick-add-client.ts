/**
 * quick-add 窗口侧的中继客户端（quick-add-v2 issue 01）。
 *
 * quick-add 不装配 Engine，字段组件（MovePicker / TagPicker）读的
 * useProjectsQuery 等在这里走 React Query 分支：把主窗口回发的快照按
 * 相同的查询键写进缓存，组件零改动即可读到本地副本的数据。缓存
 * staleTime 为 Infinity（见 main.tsx），有快照时不会再去调 REST。
 */

import type { QueryClient } from '@tanstack/react-query';
import { emitTo, listen } from '@tauri-apps/api/event';

import {
  areaKeys,
  projectKeys,
  tagKeys,
  usePreferencesStore,
  type QuickAddDraft,
} from '@taskora/api';

import {
  QUICK_ADD_RESULT_EVENT,
  QUICK_ADD_SNAPSHOT_EVENT,
  QUICK_ADD_SNAPSHOT_REQUEST_EVENT,
  QUICK_ADD_SUBMIT_EVENT,
  type QuickAddResultPayload,
  type QuickAddSnapshot,
  type QuickAddSubmitPayload,
} from './quick-add-protocol';

/** 主窗口未应答（未装配、卡住）时放弃等待的时限。 */
export const SNAPSHOT_TIMEOUT_MS = 1000;

const newRequestId = () => crypto.randomUUID();

/**
 * 向主窗口要一份数据快照。超时或失败返回 null：卡片照常可用，只是
 * 归属与 Tag 选择器为空（只能进 Inbox）。
 */
export async function requestQuickAddSnapshot(
  timeoutMs = SNAPSHOT_TIMEOUT_MS,
): Promise<QuickAddSnapshot | null> {
  const requestId = newRequestId();
  let unlisten: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<QuickAddSnapshot | null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
      void listen<QuickAddSnapshot>(QUICK_ADD_SNAPSHOT_EVENT, (event) => {
        if (event.payload?.requestId === requestId) resolve(event.payload);
      })
        .then((fn) => {
          unlisten = fn;
          // 先挂监听再发请求，应答不会早于监听到达。
          return emitTo('main', QUICK_ADD_SNAPSHOT_REQUEST_EVENT, { requestId });
        })
        .catch(() => resolve(null));
    });
  } finally {
    if (timer) clearTimeout(timer);
    unlisten?.();
  }
}

/** 快照写入查询缓存（键与各 useXxxQuery 一致）。 */
export function applyQuickAddSnapshot(queryClient: QueryClient, snapshot: QuickAddSnapshot): void {
  queryClient.setQueryData(projectKeys.all, snapshot.projects);
  queryClient.setQueryData(areaKeys.all, snapshot.areas);
  queryClient.setQueryData(tagKeys.all, snapshot.tags);
}

/**
 * 打开时刷新数据：偏好（周起始日、账号时区）在同源 localStorage 里，
 * 主窗口改过之后重新读一次即可；实体数据走快照。
 */
export async function refreshQuickAddData(queryClient: QueryClient): Promise<boolean> {
  await usePreferencesStore.persist.rehydrate();
  const snapshot = await requestQuickAddSnapshot();
  if (snapshot) applyQuickAddSnapshot(queryClient, snapshot);
  return snapshot !== null;
}

/** 提交草稿（fire-and-forget；结果经 onQuickAddResult 回执）。返回本次 requestId。 */
export async function submitQuickAddDraft(draft: QuickAddDraft): Promise<string> {
  const requestId = newRequestId();
  await emitTo<QuickAddSubmitPayload>('main', QUICK_ADD_SUBMIT_EVENT, { draft, requestId });
  return requestId;
}

/** 订阅提交结果回执。 */
export function onQuickAddResult(cb: (result: QuickAddResultPayload) => void): Promise<() => void> {
  return listen<QuickAddResultPayload>(QUICK_ADD_RESULT_EVENT, (event) => cb(event.payload));
}
