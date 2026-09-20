/**
 * 进程内 Sync Hub — 端到端 harness 的测试替身（真走协议）。
 *
 * 与 NestJS 侧 SyncHubService 同一合并语义（共用 merger 纯函数），但
 * 持久化为内存 Map。承担主接缝测试中的 hub 角色：push 合并 + 单调 seq、
 * pull 按 cursor 增量（缺口 → resync）、bootstrap 全量快照、Compact
 * Event（GC）、虚拟设备 0（Assistant）写。
 */

import { mergeFieldWrites, type EntityMergeState } from './merger';
import { hlcWallMs } from './hlc';
import type { SyncEntity } from './entities';
import type {
  BootstrapResponse,
  HubChange,
  OutboxEvent,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotEntry,
  SyncTransport,
} from './protocol';

type UserState = {
  entities: Map<string, EntityMergeState>; // key: `${entity}:${id}`
  nextSeq: number;
  buffer: HubChange[];
  /** 设备（含虚拟设备 0）已提交的最大 HLC，用于合成基线时钟。 */
  seenWallMs: number;
};

export interface InMemorySyncHubOptions {
  /** ring buffer 大小（ADR-0005 沿用：~500）。 */
  bufferSize?: number;
  /** 墙钟（测试确定性）。 */
  wallClock?: () => number;
}

export class InMemorySyncHub {
  private readonly bufferSize: number;
  private readonly wallClock: () => number;
  private readonly users = new Map<string, UserState>();

  constructor(options: InMemorySyncHubOptions = {}) {
    this.bufferSize = options.bufferSize ?? 500;
    this.wallClock = options.wallClock ?? (() => Date.now());
  }

  // ---------- 设备侧协议面 ----------

  push(userId: string, request: PushRequest): PushResponse {
    const state = this.stateFor(userId);
    for (const event of request.events) {
      this.mergeEvent(state, event);
    }
    return { acked: request.events.length };
  }

  pull(userId: string, request: PullRequest): PullResponse {
    const state = this.stateFor(userId);
    const changes = state.buffer.filter((change) => change.seq > request.cursor);
    // 缓冲之外还丢了事件（被裁剪，或 cursor 来自上一个 hub 进程）→ resync
    const missed = state.nextSeq - 1 - request.cursor - changes.length;
    const resync = request.cursor >= state.nextSeq || missed > 0;
    return {
      changes: resync ? [] : changes,
      cursor: state.nextSeq - 1,
      resync,
    };
  }

  bootstrap(userId: string): BootstrapResponse {
    const state = this.stateFor(userId);
    const snapshot: SnapshotEntry[] = [];
    for (const [key, entity] of state.entities) {
      const [entityName, id] = splitKey(key);
      snapshot.push({ entity: entityName, id, fields: entity.fields, clocks: entity.clocks });
    }
    return { snapshot, cursor: state.nextSeq - 1 };
  }

  /** 给测试用的 transport 视图（单用户 harness）。 */
  transportFor(userId: string): SyncTransport {
    return {
      push: (request) => Promise.resolve(this.push(userId, request)),
      pull: (request) => Promise.resolve(this.pull(userId, request)),
      bootstrap: () => Promise.resolve(this.bootstrap(userId)),
    };
  }

  // ---------- 虚拟设备 0（Assistant）与 GC ----------

  /** Assistant 写：与设备推送同一合并路径，无特权。 */
  submitVirtualWrite(userId: string, event: OutboxEvent): void {
    const state = this.stateFor(userId);
    this.mergeEvent(state, event);
  }

  /** hub GC 物理删除后下发 Compact Event。 */
  compact(userId: string, entity: SyncEntity, ids: string[]): void {
    if (ids.length === 0) return;
    const state = this.stateFor(userId);
    for (const id of ids) {
      state.entities.delete(`${entity}:${id}`);
    }
    this.publish(state, { kind: 'compact', seq: 0, entity, ids });
  }

  /** hub 重启：保留合并态，清空缓冲、seq 重新播种（持旧 cursor 的设备将被推入 resync）。 */
  restart(): void {
    for (const state of this.users.values()) {
      state.buffer = [];
      state.nextSeq = this.wallClock() + 1;
    }
  }

  /** 合并态读取（测试断言用）。 */
  entityState(userId: string, entity: SyncEntity, id: string): EntityMergeState | null {
    return this.stateFor(userId).entities.get(`${entity}:${id}`) ?? null;
  }

  currentSeq(userId: string): number {
    return this.stateFor(userId).nextSeq - 1;
  }

  // ---------- 内部 ----------

  private stateFor(userId: string): UserState {
    let state = this.users.get(userId);
    if (!state) {
      // Date.now() 种子：hub 重启后 seq 跳变，持旧 cursor 的设备被推入
      // resync（与 ADR-0005 同一思路）。
      state = { entities: new Map(), nextSeq: this.wallClock() + 1, buffer: [], seenWallMs: 0 };
      this.users.set(userId, state);
    }
    return state;
  }

  private mergeEvent(state: UserState, event: OutboxEvent): void {
    const key = `${event.entity}:${event.id}`;
    const current = state.entities.get(key) ?? null;
    const outcome = mergeFieldWrites(current, event.fields);
    if (outcome.appliedFields.length === 0) {
      // 纯重放：合并态未变，不分配 seq、不下发事件
      state.entities.set(key, { fields: outcome.fields, clocks: outcome.clocks });
      return;
    }
    state.entities.set(key, { fields: outcome.fields, clocks: outcome.clocks });
    state.seenWallMs = Math.max(
      state.seenWallMs,
      ...Object.values(event.fields).map((write) => hlcWallMs(write.hlc)),
    );
    this.publish(state, {
      kind: 'entity',
      seq: 0,
      entity: event.entity,
      id: event.id,
      fields: outcome.fields,
      clocks: outcome.clocks,
    });
  }

  private publish(state: UserState, change: HubChange): void {
    const framed = { ...change, seq: state.nextSeq++ } as HubChange;
    state.buffer.push(framed);
    if (state.buffer.length > this.bufferSize) {
      state.buffer.splice(0, state.buffer.length - this.bufferSize);
    }
  }
}

function splitKey(key: string): [SyncEntity, string] {
  const separator = key.indexOf(':');
  return [key.slice(0, separator) as SyncEntity, key.slice(separator + 1)];
}
