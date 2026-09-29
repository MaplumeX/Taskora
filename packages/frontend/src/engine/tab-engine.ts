/**
 * 多标签页共享一个 Local Replica（local-first-v3 issue 05）。
 *
 * OPFS 的 SQLite 同时只能被一个标签页打开，Outbox 与 HLC 也必须只有一份。
 * 由 Web Locks 选出的 leader 标签页独占副本、持有唯一的 Engine 与同步
 * 循环；每个标签页（包括 leader 自己）的 UI 都通过 TabEngine 读写：
 *
 * - leader：调用直接交给本地 Engine（becomeLeader 注入的执行器）；
 * - 其余标签页：调用经 BroadcastChannel 发给 leader，按 callId 配对结果。
 *
 * leader 广播数据变更（UI 失效）与同步状态（指示器）。leader 关闭后锁
 * 释放，排队的下一个标签页接任并宣告 hello；尚未得到结果的调用重发给
 * 新 leader——所有写都是幂等的（create 由调用方定 id，update / delete
 * 重放结果相同），所以重发安全。
 */

import type {
  Engine,
  EngineChange,
  ListOptions,
  ReplicaRow,
  SyncEntity,
  WireRow,
} from '@taskora/engine';

import type { SyncStatus } from '@taskora/api';

/** 可经标签页代理的 Engine 方法（close / onChange 是各标签页自己的）。 */
export const REMOTE_METHODS = [
  'get',
  'list',
  'create',
  'update',
  'updateMany',
  'delete',
  'pendingCount',
  'isCompacted',
  'flush',
  'pull',
  'sync',
  'bootstrap',
  'cursor',
] as const;
export type RemoteMethod = (typeof REMOTE_METHODS)[number];

/** 副本不可用的原因：所有标签页据此退回 REST。 */
export type UnavailableReason = 'upgrade-required' | 'error';

export type TabMessage =
  | { kind: 'ping' }
  | { kind: 'hello'; leader: string }
  | { kind: 'call'; callId: string; method: RemoteMethod; args: unknown[] }
  | { kind: 'result'; callId: string; ok: true; value: unknown }
  | { kind: 'result'; callId: string; ok: false; error: { name: string; message: string } }
  | { kind: 'change'; change: EngineChange }
  | { kind: 'status'; status: SyncStatus; pendingCount: number }
  | { kind: 'unavailable'; reason: UnavailableReason };

/** BroadcastChannel 的最小形状（不回送给发送者自己）。 */
export interface TabChannel {
  postMessage(message: TabMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<TabMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<TabMessage>) => void): void;
}

export type Executor = (method: RemoteMethod, args: unknown[]) => Promise<unknown>;

interface PendingCall {
  method: RemoteMethod;
  args: unknown[];
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class TabEngine implements Engine {
  private executor: Executor | null = null;
  private leader: string | null = null;
  private readonly pending = new Map<string, PendingCall>();
  private readonly changeListeners = new Set<(change: EngineChange) => void>();
  private readonly statusListeners = new Set<(status: SyncStatus, pendingCount: number) => void>();
  private readonly unavailableListeners = new Set<(reason: UnavailableReason) => void>();
  private readonly onMessage = (event: MessageEvent<TabMessage>) => this.receive(event.data);

  constructor(
    private readonly channel: TabChannel,
    readonly deviceId: string,
    private readonly newId: () => string = () => globalThis.crypto.randomUUID(),
  ) {
    channel.addEventListener('message', this.onMessage);
    // 找 leader：已有的 leader 回 hello；还没有时等它上任后自己宣告
    channel.postMessage({ kind: 'ping' });
  }

  // ---------- Engine ----------

  get(entity: SyncEntity, id: string) {
    return this.call('get', [entity, id]) as Promise<ReplicaRow | null>;
  }
  list(entity: SyncEntity, options?: ListOptions) {
    return this.call('list', [entity, options]) as Promise<ReplicaRow[]>;
  }
  create(entity: SyncEntity, values: WireRow) {
    // id 在调用方定：换 leader 时重发不会建出第二行
    const id = typeof values.id === 'string' ? values.id : this.newId();
    return this.call('create', [entity, { ...values, id }]) as Promise<string>;
  }
  update(entity: SyncEntity, id: string, patch: WireRow) {
    return this.call('update', [entity, id, patch]) as Promise<void>;
  }
  updateMany(entity: SyncEntity, patches: Array<{ id: string; patch: WireRow }>) {
    return this.call('updateMany', [entity, patches]) as Promise<void>;
  }
  delete(entity: SyncEntity, ids: string[]) {
    return this.call('delete', [entity, ids]) as Promise<void>;
  }
  pendingCount() {
    return this.call('pendingCount', []) as Promise<number>;
  }
  isCompacted(entity: SyncEntity, id: string) {
    return this.call('isCompacted', [entity, id]) as Promise<boolean>;
  }
  flush() {
    return this.call('flush', []) as Promise<void>;
  }
  pull() {
    return this.call('pull', []) as Promise<void>;
  }
  sync() {
    return this.call('sync', []) as Promise<void>;
  }
  bootstrap() {
    return this.call('bootstrap', []) as Promise<void>;
  }
  cursor() {
    return this.call('cursor', []) as Promise<number>;
  }
  onChange(listener: (change: EngineChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }
  /** 只断开本标签页；副本的生命周期归 leader（见 web-engine.ts）。 */
  async close(): Promise<void> {
    this.channel.removeEventListener('message', this.onMessage);
    const error = new Error('Engine 已关闭');
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
  }

  // ---------- 标签页协调 ----------

  onStatus(listener: (status: SyncStatus, pendingCount: number) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onUnavailable(listener: (reason: UnavailableReason) => void): () => void {
    this.unavailableListeners.add(listener);
    return () => this.unavailableListeners.delete(listener);
  }

  /** 本标签页成为 leader：此后（含尚未得到结果的）调用交给本地执行器。 */
  becomeLeader(executor: Executor): void {
    this.executor = executor;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const call of waiting) this.dispatchLocal(call);
  }

  /** leader 侧：本地 Engine 的变更通知本标签页（其它标签页由 host 广播）。 */
  emitChange(change: EngineChange): void {
    this.changeListeners.forEach((listener) => listener(change));
  }

  emitStatus(status: SyncStatus, pendingCount: number): void {
    this.statusListeners.forEach((listener) => listener(status, pendingCount));
  }

  emitUnavailable(reason: UnavailableReason): void {
    this.unavailableListeners.forEach((listener) => listener(reason));
  }

  private call(method: RemoteMethod, args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const call = { method, args, resolve, reject };
      if (this.executor) {
        this.dispatchLocal(call);
        return;
      }
      const callId = this.newId();
      this.pending.set(callId, call);
      // 还没有 leader 时先挂着，hello 到达后发出
      if (this.leader) this.channel.postMessage({ kind: 'call', callId, method, args });
    });
  }

  private dispatchLocal(call: PendingCall): void {
    this.executor!(call.method, call.args).then(call.resolve, call.reject);
  }

  private receive(message: TabMessage): void {
    switch (message.kind) {
      case 'hello':
        if (this.executor || message.leader === this.leader) return;
        // 新 leader：没有结果的调用全部重发（写都幂等）
        this.leader = message.leader;
        for (const [callId, call] of this.pending) {
          this.channel.postMessage({ kind: 'call', callId, method: call.method, args: call.args });
        }
        return;
      case 'result': {
        const call = this.pending.get(message.callId);
        if (!call) return;
        this.pending.delete(message.callId);
        if (message.ok) {
          call.resolve(message.value);
        } else {
          call.reject(rebuildError(message.error));
        }
        return;
      }
      case 'change':
        if (!this.executor) this.emitChange(message.change);
        return;
      case 'status':
        if (!this.executor) this.emitStatus(message.status, message.pendingCount);
        return;
      case 'unavailable':
        if (!this.executor) this.emitUnavailable(message.reason);
        return;
      default:
        return;
    }
  }
}

/**
 * leader 侧：服务其它标签页的调用，广播变更与状态。execute 同时是本
 * 标签页 TabEngine 的执行器（becomeLeader）。overrides 让 sync 走 leader
 * 的同步调度（合并并发、驱动状态指示器），而不是直接调 Engine。
 */
export function createEngineHost(
  channel: TabChannel,
  engine: Engine,
  leaderId: string,
  overrides: Partial<Record<RemoteMethod, (...args: unknown[]) => Promise<unknown>>> = {},
) {
  const execute: Executor = (method, args) => {
    const override = overrides[method];
    if (override) return override(...args);
    const fn = engine[method] as (...a: unknown[]) => Promise<unknown>;
    return fn.apply(engine, args);
  };

  const onMessage = (event: MessageEvent<TabMessage>) => {
    const message = event.data;
    if (message.kind === 'ping') {
      channel.postMessage({ kind: 'hello', leader: leaderId });
    } else if (message.kind === 'call') {
      if (!REMOTE_METHODS.includes(message.method)) return;
      execute(message.method, message.args).then(
        (value) => channel.postMessage({ kind: 'result', callId: message.callId, ok: true, value }),
        (error: unknown) =>
          channel.postMessage({
            kind: 'result',
            callId: message.callId,
            ok: false,
            error: {
              name: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : String(error),
            },
          }),
      );
    }
  };
  channel.addEventListener('message', onMessage);
  channel.postMessage({ kind: 'hello', leader: leaderId });

  return {
    execute,
    broadcastChange(change: EngineChange) {
      channel.postMessage({ kind: 'change', change });
    },
    broadcastStatus(status: SyncStatus, pendingCount: number) {
      channel.postMessage({ kind: 'status', status, pendingCount });
    },
    broadcastUnavailable(reason: UnavailableReason) {
      channel.postMessage({ kind: 'unavailable', reason });
    },
    stop() {
      channel.removeEventListener('message', onMessage);
    },
  };
}

function rebuildError(error: { name: string; message: string }): Error {
  const rebuilt = new Error(error.message);
  rebuilt.name = error.name;
  return rebuilt;
}
