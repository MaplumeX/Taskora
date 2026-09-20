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
import { DELETE_CASCADES, type SyncEntity } from './entities';
import type {
  BootstrapResponse,
  DeleteRequest,
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
  /**
   * Compact 登记（ADR-0008）：已被物理删除的实体 key。迟到的字段写
   * 到达这些 key 时被静默丢弃（Compact 永久获胜，与 NestJS hub 的
   * CompactedEntity 表同规则）。
   */
  compacted: Set<string>;
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

  push(userId: string, pushRequest: PushRequest): PushResponse {
    const state = this.stateFor(userId);
    for (const event of pushRequest.events) {
      this.mergeEvent(state, event);
    }
    // 先合并字段写、再应用删除（ADR-0008 同序：字段写 → 删除）
    for (const deleteRequest of pushRequest.deletes ?? []) {
      this.applyDeleteRequest(state, deleteRequest);
    }
    return { acked: pushRequest.events.length };
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
    const state = this.stateFor(userId);
    this.removeAndPublish(state, entity, ids);
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
      state = {
        entities: new Map(),
        nextSeq: this.wallClock() + 1,
        buffer: [],
        seenWallMs: 0,
        compacted: new Set(),
      };
      this.users.set(userId, state);
    }
    return state;
  }

  private mergeEvent(state: UserState, event: OutboxEvent): void {
    const key = `${event.entity}:${event.id}`;
    // Compact 永久获胜（ADR-0008）：已 compact 的实体，迟到的字段写
    // 静默丢弃（不重建、不发事件）。
    if (state.compacted.has(key)) return;
    // 孤儿 Subtask 防御：父 Task 不存在（含已被 compact）时丢弃，与
    // NestJS hub 的越权拒绝路径同规则。
    if (event.entity === 'subtask' && !state.entities.has(`task:${event.fields.taskId?.value}`)) {
      return;
    }
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

  /**
   * 设备发起的 Delete Request（ADR-0008）：物理删除并广播 Compact
   * Event。Task 级联删除其 Subtask（每用户单调 seq）。幂等：重放
   * （实体已不存在）为 no-op，不产生新事件。
   */
  private applyDeleteRequest(state: UserState, request: DeleteRequest): void {
    if (request.ids.length === 0) return;
    const cascade = DELETE_CASCADES[request.entity] ?? [];
    // 级联（对齐 NestJS hub 的 onDelete: Cascade）：Task → Subtask
    for (const rule of cascade) {
      const childIds: string[] = [];
      for (const [key, entityState] of state.entities) {
        if (!key.startsWith(`${rule.entity}:`)) continue;
        if (request.ids.includes(entityState.fields[rule.foreignKey] as string)) {
          childIds.push(key.slice(rule.entity.length + 1));
        }
      }
      this.removeAndPublish(state, rule.entity, childIds);
    }
    this.removeAndPublish(state, request.entity, request.ids);
  }

  /**
   * 登记 compact + 删行 + 广播 Compact Event（仅实际移除的 id；
   * 不存在的 id 幂等跳过，不产生新事件）。
   */
  private removeAndPublish(state: UserState, entity: SyncEntity, ids: string[]): void {
    if (ids.length === 0) return;
    const removed: string[] = [];
    for (const id of ids) {
      const key = `${entity}:${id}`;
      state.compacted.add(key);
      if (state.entities.delete(key)) removed.push(id);
    }
    if (removed.length > 0) {
      this.publish(state, { kind: 'compact', seq: 0, entity, ids: removed });
    }
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
