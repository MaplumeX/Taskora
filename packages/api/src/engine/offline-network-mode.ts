import type { QueryClient } from '@tanstack/react-query';

/**
 * Engine 模式下读写都在本地副本：查询与 mutation 不再因 WebView 报告离线而
 * 暂停。返回恢复原设置的函数（退回 REST 时调用）。
 *
 * React Query 默认 networkMode 'online'：收到 offline 事件后，mutation 先跑
 * onMutate（乐观补丁已上屏），mutationFn 却被暂停，直到 online 事件到来。
 * Android WebView 切网 / 弱网 / 后台恢复时会派发 offline，而 online 不一定
 * 跟着来——新建任务停在「创建中」，改过的字段只在补丁里，从未写进副本。
 */
export function runQueriesWhileOffline(queryClient: QueryClient): () => void {
  const previous = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...previous,
    queries: { ...previous.queries, networkMode: 'always' },
    mutations: { ...previous.mutations, networkMode: 'always' },
  });
  return () => queryClient.setDefaultOptions(previous);
}
