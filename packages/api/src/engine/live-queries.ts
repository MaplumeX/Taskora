/**
 * Engine 模式的查询存储（local-first-v3 issue 06）。
 *
 * 取代 Engine 模式下的 React Query 缓存：每条被界面订阅的查询经
 * `engine.watch` 运行，写入提交后只重跑依赖受影响的查询，结果结构去重后
 * 推送给订阅它的组件。写入到渲染只经过一次查询，不再有「通知 → 失效 →
 * 重查」这一层。
 *
 * 即时显示仍保留（理由见 issue 02：经 IPC 的本地写要几帧）：mutation 的
 * 乐观补丁经 `queryCache(queryClient)` 门面落到这里，写入的变更通知随后
 * 重跑查询，以副本为准覆盖补丁。
 *
 * 查询键沿用 React Query 的写法（`['tasks', params]`），乐观补丁按根键
 * 前缀匹配，与 REST 模式的 hooks 共用同一套补丁代码。
 */

import { hashKey, partialMatchKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

import {
  replaceEqualDeep,
  type Engine,
  type QueryDependency,
  type QueryWatch,
} from '@taskora/engine';

export type LiveQueryStatus = 'pending' | 'success' | 'error';

export interface LiveQueryState<T> {
  data: T | undefined;
  error: unknown;
  status: LiveQueryStatus;
}

export interface LiveQueryDefinition<T> {
  queryKey: QueryKey;
  dependsOn: readonly QueryDependency[];
  queryFn: () => Promise<T>;
}

interface Entry {
  key: QueryKey;
  definition: LiveQueryDefinition<unknown> | null;
  state: LiveQueryState<unknown>;
  listeners: Set<() => void>;
  watch: QueryWatch | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
  prefetchTimer: ReturnType<typeof setTimeout> | null;
  reads: number;
}

/** 无人订阅的查询保留结果的时长：回到刚离开的视图时先显示旧结果再重跑。 */
const GC_MS = 5 * 60_000;

const PENDING: LiveQueryState<never> = Object.freeze({
  data: undefined,
  error: null,
  status: 'pending',
}) as LiveQueryState<never>;

type WatchSource = Pick<Engine, 'watch'>;

let source: WatchSource | null = null;
/** 每次 attach 加一：订阅按世代重建（换账号时旧条目已清空）。detach 为 0。 */
let generation = 0;
let attachCount = 0;
const entries = new Map<string, Entry>();
const modeListeners = new Set<() => void>();

function notifyMode() {
  for (const listener of [...modeListeners]) listener();
}

function notifyEntry(entry: Entry) {
  for (const listener of [...entry.listeners]) listener();
}

function clearEntries() {
  for (const entry of entries.values()) {
    entry.watch?.stop();
    if (entry.gcTimer) clearTimeout(entry.gcTimer);
    if (entry.prefetchTimer) clearTimeout(entry.prefetchTimer);
  }
  entries.clear();
}

/**
 * 进入 Engine 模式：界面读改由这条 Engine 的响应式查询提供。在注入各域
 * Engine 后端之后调用（查询函数经后端读副本）。
 */
export function attachLiveQueries(engine: WatchSource): void {
  clearEntries();
  source = engine;
  attachCount += 1;
  generation = attachCount;
  notifyMode();
}

/** 退出 Engine 模式（登出 / 退回 REST）：停掉全部查询，界面回到 React Query。 */
export function detachLiveQueries(): void {
  clearEntries();
  if (source === null) return;
  source = null;
  generation = 0;
  notifyMode();
}

export function isLiveQueryMode(): boolean {
  return source !== null;
}

/** 当前 attach 世代（0 表示 REST 模式）。 */
export function liveQueryGeneration(): number {
  return generation;
}

export function subscribeLiveQueryMode(listener: () => void): () => void {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

function entryFor(key: QueryKey): Entry {
  const hash = hashKey(key);
  let entry = entries.get(hash);
  if (!entry) {
    entry = {
      key,
      definition: null,
      state: PENDING,
      listeners: new Set(),
      watch: null,
      gcTimer: null,
      prefetchTimer: null,
      reads: 0,
    };
    entries.set(hash, entry);
    scheduleGc(hash, entry);
  }
  return entry;
}

function scheduleGc(hash: string, entry: Entry) {
  if (entry.gcTimer) clearTimeout(entry.gcTimer);
  entry.gcTimer = setTimeout(() => {
    if (entry.listeners.size === 0 && entries.get(hash) === entry) {
      entry.watch?.stop();
      if (entry.prefetchTimer) clearTimeout(entry.prefetchTimer);
      entries.delete(hash);
    }
  }, GC_MS);
}

function setState(entry: Entry, next: LiveQueryState<unknown>) {
  const data = replaceEqualDeep(entry.state.data, next.data);
  if (
    data === entry.state.data &&
    next.status === entry.state.status &&
    next.error === entry.state.error
  ) {
    return;
  }
  entry.state = { ...next, data };
  notifyEntry(entry);
}

function startWatch(entry: Entry) {
  if (!source || entry.watch || !entry.definition) return;
  const { dependsOn, queryFn } = entry.definition;
  entry.watch = source.watch(
    {
      dependsOn,
      run: async () => {
        entry.reads += 1;
        try {
          return await queryFn();
        } finally {
          entry.reads -= 1;
        }
      },
    },
    {
      next: (data) => setState(entry, { data, error: null, status: 'success' }),
      // 与 React Query 一致：出错时保留上一次的结果
      error: (error) => setState(entry, { data: entry.state.data, error, status: 'error' }),
    },
  );
}

/** 订阅一条查询（useEngineQuery 的底层）；返回退订函数。 */
export function subscribeLiveQuery<T>(
  definition: LiveQueryDefinition<T>,
  listener: () => void,
): () => void {
  const hash = hashKey(definition.queryKey);
  const entry = entryFor(definition.queryKey);
  entry.definition = definition as LiveQueryDefinition<unknown>;
  entry.listeners.add(listener);
  if (entry.prefetchTimer) {
    clearTimeout(entry.prefetchTimer);
    entry.prefetchTimer = null;
  }
  if (entry.gcTimer) {
    clearTimeout(entry.gcTimer);
    entry.gcTimer = null;
  }
  // 无人订阅期间没有 watch：沿用旧结果先显示，watch 启动即重跑
  startWatch(entry);
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0) return;
    entry.watch?.stop();
    entry.watch = null;
    if (entries.get(hash) === entry) scheduleGc(hash, entry);
  };
}

export function liveQueryState<T>(queryKey: QueryKey): LiveQueryState<T> {
  return (entries.get(hashKey(queryKey))?.state ?? PENDING) as LiveQueryState<T>;
}

/** 首屏活跃查询完成前不开始预加载，避免与当前页面的数据读取竞争。 */
export function hasPendingLiveQueries(): boolean {
  return [...entries.values()].some(
    (entry) => entry.listeners.size > 0 && (entry.state.status === 'pending' || entry.reads > 0),
  );
}

/**
 * 导航意图预取：复用 watch 的在途读取和变更订阅，点击后直接接管。
 * 未进入页面的预取只订阅 30 秒，之后保留结果，避免扫过项目列表产生长期查询。
 */
export function prefetchLiveQuery<T>(definition: LiveQueryDefinition<T>): void {
  if (!source) return;
  const entry = entryFor(definition.queryKey);
  if (entry.watch) return;
  entry.definition = definition as LiveQueryDefinition<unknown>;
  startWatch(entry);
  entry.prefetchTimer = setTimeout(() => {
    entry.prefetchTimer = null;
    if (entry.listeners.size === 0) {
      entry.watch?.stop();
      entry.watch = null;
    }
  }, 30_000);
}

// ---------- 乐观补丁门面 ----------

type Updater<T> = T | undefined | ((old: T | undefined) => T | undefined);

interface KeyFilter {
  queryKey?: QueryKey;
  exact?: boolean;
}

function matching(filters: KeyFilter): Entry[] {
  const { queryKey, exact } = filters;
  return [...entries.values()].filter((entry) => {
    if (!queryKey) return true;
    return exact ? hashKey(entry.key) === hashKey(queryKey) : partialMatchKey(entry.key, queryKey);
  });
}

function applyUpdater<T>(entry: Entry, updater: Updater<T>) {
  const next =
    typeof updater === 'function'
      ? (updater as (old: T | undefined) => T | undefined)(entry.state.data as T | undefined)
      : updater;
  if (next === undefined) return;
  // 在飞 / 排队的查询读的是补丁之前的副本，送达会把补丁冲回旧值；
  // 写入的变更通知会再重跑。
  entry.watch?.cancel();
  setState(entry, { data: next, error: null, status: 'success' });
}

/**
 * mutation 操作缓存所需的 QueryClient 子集。Engine 模式下作用于本存储，
 * REST 模式下原样转给 React Query——hooks 的补丁代码两种模式共用。
 */
export interface QueryCacheFacade {
  getQueryData<T>(queryKey: QueryKey): T | undefined;
  getQueriesData<T>(filters: KeyFilter): [QueryKey, T | undefined][];
  setQueryData<T>(queryKey: QueryKey, updater: Updater<T>): void;
  setQueriesData<T>(filters: KeyFilter, updater: Updater<T>): void;
  cancelQueries(filters?: KeyFilter): Promise<void>;
  /** Engine 模式：立即重跑匹配的查询（写入失败后的兜底、跨日刷新）。 */
  invalidateQueries(filters?: KeyFilter): Promise<void>;
}

const liveCache: QueryCacheFacade = {
  getQueryData: <T>(queryKey: QueryKey) =>
    entries.get(hashKey(queryKey))?.state.data as T | undefined,
  getQueriesData: <T>(filters: KeyFilter) =>
    matching(filters).map((entry) => [entry.key, entry.state.data as T | undefined]),
  setQueryData<T>(queryKey: QueryKey, updater: Updater<T>) {
    applyUpdater(entryFor(queryKey), updater);
  },
  setQueriesData<T>(filters: KeyFilter, updater: Updater<T>) {
    for (const entry of matching(filters)) applyUpdater(entry, updater);
  },
  async cancelQueries(filters: KeyFilter = {}) {
    for (const entry of matching(filters)) entry.watch?.cancel();
  },
  async invalidateQueries(filters: KeyFilter = {}) {
    // 没有 watch 的查询下次订阅时本来就会重跑
    for (const entry of matching(filters)) entry.watch?.refresh();
  },
};

/**
 * 按模式分派的缓存：每次调用时判定（mutation 跨越登录 / 退回 REST 时
 * 不会写错地方）。Engine 模式为本存储，否则为 React Query。
 */
export function queryCache(queryClient: QueryClient): QueryCacheFacade {
  const rest: QueryCacheFacade = {
    getQueryData: (queryKey) => queryClient.getQueryData(queryKey),
    getQueriesData: (filters) => queryClient.getQueriesData(filters),
    setQueryData: (queryKey, updater) => {
      queryClient.setQueryData(queryKey, updater as never);
    },
    setQueriesData: (filters, updater) => {
      queryClient.setQueriesData(filters, updater as never);
    },
    cancelQueries: (filters) => queryClient.cancelQueries(filters),
    invalidateQueries: (filters) => queryClient.invalidateQueries(filters),
  };
  const pick = () => (isLiveQueryMode() ? liveCache : rest);
  return {
    getQueryData: (queryKey) => pick().getQueryData(queryKey),
    getQueriesData: (filters) => pick().getQueriesData(filters),
    setQueryData: (queryKey, updater) => pick().setQueryData(queryKey, updater),
    setQueriesData: (filters, updater) => pick().setQueriesData(filters, updater),
    cancelQueries: (filters) => pick().cancelQueries(filters),
    invalidateQueries: (filters) => pick().invalidateQueries(filters),
  };
}

/** 测试：清空存储并退出 Engine 模式。 */
export function resetLiveQueriesForTest(): void {
  detachLiveQueries();
}
