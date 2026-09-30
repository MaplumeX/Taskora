/**
 * 响应式查询（local-first-v3 issue 06）：查询声明依赖的实体（可选限定到
 * 行 id），Engine 在写事务提交后只重跑受影响的查询，结果按结构比较后才
 * 推送。第一版不做增量计算：「精确失效 + 结果去重」。
 *
 * 只依赖变更通知（onChange），因此对任何 Engine 形态都成立——包括 web
 * 非 leader 标签页经 BroadcastChannel 代理的 Engine。
 */

import type { SyncEntity } from './entities';
import type { EngineChange } from './replica';

/** 查询依赖：整个实体，或实体中的若干行。 */
export type QueryDependency = SyncEntity | { entity: SyncEntity; ids: readonly string[] };

export interface LiveQuery<T> {
  dependsOn: readonly QueryDependency[];
  run(): Promise<T>;
}

export interface QueryObserver<T> {
  next(result: T): void;
  error?(error: unknown): void;
}

export interface QueryWatch {
  /** 立即重跑（不依赖数据变更的刷新，如跨过午夜后「今天」变了）。 */
  refresh(): void;
  /**
   * 丢弃在飞的结果（不重跑），并让下一个结果无论是否与上次相同都推送。
   * 调用方在自己改写了展示数据（乐观补丁）之后用它：在飞的查询读的是
   * 写入前的副本，送达会把补丁冲回旧值；随后写入的变更通知会重跑。
   */
  cancel(): void;
  stop(): void;
}

/** 该变更是否可能影响声明了这些依赖的查询。 */
export function changeAffects(change: EngineChange, dependsOn: readonly QueryDependency[]): boolean {
  if (!change.entities) return true; // bootstrap 整表重建
  for (const dependency of dependsOn) {
    const entity = typeof dependency === 'string' ? dependency : dependency.entity;
    if (!change.entities.includes(entity)) continue;
    if (typeof dependency === 'string') return true;
    const changedIds = change.ids?.[entity];
    if (!changedIds) return true; // 行未知
    if (changedIds.some((id) => dependency.ids.includes(id))) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * 结构共享：next 与 prev 深度相等的子树沿用 prev 的引用；整体相等时返回
 * prev 本身。没变的行保持同一对象，memo 化的行组件不重渲染。
 */
export function replaceEqualDeep<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  const bothArrays = Array.isArray(prev) && Array.isArray(next);
  if (!bothArrays && !(isPlainObject(prev) && isPlainObject(next))) return next;
  const prevRecord = prev as Record<string | number, unknown>;
  const nextRecord = next as Record<string | number, unknown>;
  const prevKeys = bothArrays ? null : Object.keys(prevRecord);
  const keys = bothArrays
    ? Array.from({ length: (next as unknown[]).length }, (_, index) => index)
    : Object.keys(nextRecord);
  const prevSize = bothArrays ? (prev as unknown[]).length : prevKeys!.length;
  const copy = (bothArrays ? [] : {}) as Record<string | number, unknown>;
  let equalItems = 0;
  for (const key of keys) {
    const shared = replaceEqualDeep(prevRecord[key], nextRecord[key]);
    copy[key] = shared;
    if (shared === prevRecord[key] && (bothArrays || key in prevRecord)) equalItems += 1;
  }
  return (prevSize === keys.length && equalItems === prevSize ? prev : copy) as T;
}

/** 连续丢弃在飞结果的上限：变更持续涌入时仍要推送，不能饿死界面。 */
const MAX_CONSECUTIVE_DISCARDS = 3;

/**
 * 订阅一条查询：立即运行一次，之后每个影响它的变更触发一次重跑。
 *
 * - 同步连发的变更（一个事务后的多个通知）合并为一次重跑（微任务）。
 * - 重跑期间又来了影响它的变更：结果作废、再跑一轮——在飞的查询可能
 *   读到多步写的中间态，推送它只会多渲染一帧错的内容。
 * - 结果与上次结构相同则不推送；不同则推送结构共享后的结果。
 */
export function watchQuery<T>(
  source: { onChange(listener: (change: EngineChange) => void): () => void },
  query: LiveQuery<T>,
  observer: QueryObserver<T>,
): QueryWatch {
  let stopped = false;
  let running = false;
  let scheduled = false;
  let dirty = false;
  let discards = 0;
  let generation = 0;
  let scheduleToken = 0;
  let hasLast = false;
  let last: T | undefined;

  const run = async (): Promise<void> => {
    scheduled = false;
    running = true;
    dirty = false;
    const startedAt = generation;
    let outcome: { ok: true; value: T } | { ok: false; error: unknown };
    try {
      outcome = { ok: true, value: await query.run() };
    } catch (error) {
      outcome = { ok: false, error };
    }
    running = false;
    if (stopped) return;
    const again = dirty;
    if (again && discards < MAX_CONSECUTIVE_DISCARDS) {
      discards += 1;
      void run();
      return;
    }
    discards = 0;
    // 被 cancel 作废的结果不推送：等下一个变更（或 refresh）
    if (startedAt === generation) deliver(outcome);
    if (again) schedule();
  };

  const deliver = (outcome: { ok: true; value: T } | { ok: false; error: unknown }) => {
    if (!outcome.ok) {
      observer.error?.(outcome.error);
      return;
    }
    const shared = replaceEqualDeep(last, outcome.value);
    if (hasLast && shared === last) return;
    hasLast = true;
    last = shared;
    observer.next(shared);
  };

  const schedule = () => {
    if (stopped) return;
    if (running) {
      dirty = true;
      return;
    }
    if (scheduled) return;
    scheduled = true;
    const token = ++scheduleToken;
    queueMicrotask(() => {
      // 排队期间被 cancel（或已被新一轮取代）：这一轮不跑
      if (stopped || token !== scheduleToken) return;
      void run();
    });
  };

  const unsubscribe = source.onChange((change) => {
    if (changeAffects(change, query.dependsOn)) schedule();
  });
  schedule();

  return {
    refresh: schedule,
    cancel() {
      generation += 1;
      scheduleToken += 1;
      scheduled = false;
      hasLast = false;
      last = undefined;
    },
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
