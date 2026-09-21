/**
 * 进程内 Sync Hub — 端到端 harness 的测试替身（真走协议）。
 *
 * 与 NestJS 侧 SyncHubService 同一合并语义（共用 merger 纯函数），但
 * 持久化为内存 Map。承担主接缝测试中的 hub 角色：push 合并 + 单调 seq、
 * pull 按 cursor 增量（缺口 → resync）、bootstrap 全量快照、Compact
 * Event（GC）、虚拟设备 0（Assistant）写。
 */

import { mergeFieldWrites, type EntityMergeState, type MergeOutcome } from './merger';
import { formatHlc, hlcWallMs } from './hlc';
import { DELETE_CASCADES, REFERENCE_FIELDS, type SyncEntity } from './entities';
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
    const compacted = new Map<SyncEntity, string[]>();
    for (const key of state.compacted) {
      const [entity, id] = splitKey(key);
      const ids = compacted.get(entity) ?? [];
      ids.push(id);
      compacted.set(entity, ids);
    }
    return {
      snapshot,
      cursor: state.nextSeq - 1,
      compacted: [...compacted].map(([entity, ids]) => ({ entity, ids })),
    };
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
    // 失效引用清洗（REFERENCE_FIELDS）：离线写可能引用此后被 compact
    // 的实体。数组剔除失效 id、标量置 null；Subtask.taskId 失效则整
    // 事件丢弃。清洗值需以虚拟设备 0 的更新时钟下发，否则推送设备
    // 的同钟本地值在 LWW 平局下保留、永不收敛。三态探针：尚未到达
    // （同批后序事件可能创建）的引用保留，由 FK 失败驱动重试收敛。
    const referenceStatus = (target: SyncEntity, id: string) => {
      const targetKey = `${target}:${id}`;
      if (state.compacted.has(targetKey)) return 'dead' as const;
      if (state.entities.has(targetKey)) return 'alive' as const;
      return 'pending' as const;
    };
    const handled = scrubReferences(
      event.entity,
      current,
      outcome,
      referenceStatus,
      () =>
        formatHlc({
          // 必胜时钟：晚于已见时钟、hub 墙钟与本事件自身的 HLC 墙钟
          // （设备时钟可能超前于 hub 墙钟）。
          wallMs:
            Math.max(
              state.seenWallMs,
              this.wallClock(),
              ...Object.values(event.fields).map((write) => hlcWallMs(write.hlc)),
            ) + 1,
          counter: 0,
          deviceId: VIRTUAL_DEVICE_ID,
        }),
    );
    if (!handled) return;
    if (outcome.appliedFields.length === 0) {
      // 纯重放：合并态未变，不分配 seq、不下发事件
      state.entities.set(key, { fields: outcome.fields, clocks: outcome.clocks });
      return;
    }
    state.seenWallMs = Math.max(
      state.seenWallMs,
      ...Object.values(event.fields).map((write) => hlcWallMs(write.hlc)),
    );
    // 落库值归一化（与 NestJS SyncHubService 同口径，回声幂等的关键）：
    // 真实 hub 的列值 ≠ 设备推送值——tagIds 经关系表读回排序、不可空列
    // 取 Prisma 默认值（sortOrder null → 0）；updatedAt 仅在补丁未携带
    // 时兑底为最大时钟墙钟（携带时设备值原样落库）。时钟保持合并结果
    // （摘要按落库值回填，见 sync-hub.service.applyEvent），因此设备
    // pull 到自己的回声时逐字段时钟持平 → 零应用、零通知；值与本地
    // 一致，不留下两端分叉。
    const merged: EntityMergeState = {
      fields: { ...outcome.fields },
      clocks: outcome.clocks,
    };
    if (!('updatedAt' in merged.fields)) {
      // 补丁未携带 updatedAt（如虚拟设备 0 部分写新建）：兑底为最大
      // 时钟墙钟，与 hub 一致，不引入 hub 墙钟不确定性。
      const maxWall = Math.max(
        0,
        ...Object.values(outcome.clocks).map((stamp) => hlcWallMs(stamp)),
      );
      merged.fields.updatedAt = new Date(maxWall).toISOString();
    }
    if (Array.isArray(merged.fields.tagIds)) {
      merged.fields.tagIds = [...(merged.fields.tagIds as string[])].sort();
    }
    if ('sortOrder' in merged.fields && merged.fields.sortOrder === null) {
      merged.fields.sortOrder = 0;
    }
    state.entities.set(key, merged);
    this.publish(state, {
      kind: 'entity',
      seq: 0,
      entity: event.entity,
      id: event.id,
      fields: merged.fields,
      clocks: merged.clocks,
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

/** 虚拟设备 0：hub 合成修正（清洗/基线）的时钟主体。 */
export const VIRTUAL_DEVICE_ID = '0';

/** 引用目标状态：存活 / 已失效（compact、越权）/ 未到达（同批后序事件可能创建，保留引用由 FK 失败驱动重试）。 */
export type ReferenceStatus = 'alive' | 'dead' | 'pending';

/** 引用目标状态探针。 */
export type ReferenceProbe = (entity: SyncEntity, id: string) => ReferenceStatus;

/** 为被清洗字段生成必胜时钟（晚于推送设备的 HLC）。 */
export type ClockBump = () => string;

/**
 * 合并结果中的失效引用清洗（REFERENCE_FIELDS 注册表驱动）。
 *
 * 就地修改 outcome（fields/clocks/appliedFields）：
 * - 数组引用：剔除 dead id（pending 保留，等待批内后序事件）；
 * - 标量引用：置 null（对齐 compact 的 SetNull 语义）；
 * - Subtask.taskId 为 dead：返回 false（整事件丢弃，孤儿防御）；
 * - 清洗后值与当前态一致：从 appliedFields 撤销并还原时钟（维持
 *   「合并态未变 → 零事件」的纯重放性质）；
 * - 清洗产生新值：字段时钟提升为 bumpClock()（虚拟设备 0），保证推送
 *   设备 pull 回声时真正应用清洗值（平局保留本地会导致永不收敛）。
 *
 * 返回 false 表示事件应被丢弃；true 表示已处理（可能零变更）。
 * 同步纯函数：调用方（NestJS hub）先批量预加载状态集，再传入探针。
 */
export function scrubReferences(
  entity: SyncEntity,
  current: EntityMergeState | null,
  outcome: MergeOutcome,
  probe: ReferenceProbe,
  bumpClock: ClockBump,
): boolean {
  const refs = REFERENCE_FIELDS[entity];
  if (!refs) return true;
  for (const field of [...outcome.appliedFields]) {
    const ref = refs[field];
    if (!ref) continue;
    const value = outcome.fields[field];

    if (ref.array) {
      if (!Array.isArray(value)) continue;
      const kept: string[] = [];
      for (const id of value) {
        if (typeof id !== 'string') continue;
        if (probe(ref.entity, id) !== 'dead') kept.push(id);
      }
      if (kept.length === value.length) continue;
      applyScrub(field, kept, current, outcome, bumpClock);
      continue;
    }

    if (value == null) {
      // Subtask.taskId 不可为 null（孤儿防御）：丢弃整事件
      if (entity === 'subtask' && field === 'taskId') return false;
      continue;
    }
    if (typeof value !== 'string') continue;
    if (probe(ref.entity, value) !== 'dead') continue;
    if (entity === 'subtask' && field === 'taskId') return false;
    applyScrub(field, null, current, outcome, bumpClock);
  }
  return true;
}

function applyScrub(
  field: string,
  scrubbed: string[] | null,
  current: EntityMergeState | null,
  outcome: MergeOutcome,
  bumpClock: ClockBump,
): void {
  // 清洗后与当前态一致：撤销应用（维持纯重放性质），不提升时钟
  if (current && sameValue(current.fields[field], scrubbed)) {
    const index = outcome.appliedFields.indexOf(field);
    if (index !== -1) outcome.appliedFields.splice(index, 1);
    if (current.clocks[field] !== undefined) outcome.clocks[field] = current.clocks[field];
    return;
  }
  outcome.fields[field] = scrubbed;
  outcome.clocks[field] = bumpClock();
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
