/**
 * 同步协议类型 — 设备（Engine）与 Sync Hub 之间的线上格式。
 *
 * 推拉式三段（ADR-0007）：设备把 Outbox 中的 Change Event batch 推给
 * hub → hub 按字段级 LWW 合并、按每用户单调 seq 记录变更 → 设备凭
 * Sync Cursor 拉取全局增量（含其他设备与虚拟设备 0 的写）。
 *
 * 注意术语（CONTEXT.md）：Change Event 在此是同步协议中的变更单元，
 * 双向流动；不再是「服务端推送通知」。
 */

import type { EntityMergeState, FieldWrite } from './merger';
import type { SyncEntity } from './entities';

/**
 * 同步协议版本（local-first-v3 issue 03）。线上格式或语义有不兼容变化时
 * 加一；升级规则见 ADR-0007「协议版本」。
 *
 * 0：版本号出现之前的客户端（请求不带版本头）。
 * 1：请求带版本头；hub 响应带版本信息；push 逐条拒绝不认识的实体 / 字段
 *    （PushResponse.rejected），不再整批 400。
 * 2：bootstrap 分页（BootstrapRequest / BootstrapResponse.next），快照可
 *    按 settledAfter 省略归档的 Logbook（local-first-v3 issue 08）。hub
 *    对协议 2 以下的请求仍回整包快照。
 * 3：HLC 按数值裁决，容忍旧版发出的小数墙钟时间戳（见 compareHlc）。
 *    设备在 hub 声明协议 3 后才整行重推带这类时间戳的行（一次性修复）。
 * 4：wire 不再携带 sortOrder，全部实体只按 position 排序（retire-sort-order）。
 *    hub 最低协议同步升到 4：协议 3 的客户端对 Area / ProjectHeading /
 *    TagGroup / Subtask 的重排只写 sortOrder，会被永久拒在 Outbox 里。
 * 5：嵌套 Tag（ADR-0016）：实体 tag-group 退役，Tag 的 tagGroupId 改为
 *    parentId。hub 最低协议同步升到 5：协议 4 的客户端还会写 tag-group
 *    与 tagGroupId，这些写会被永久拒在 Outbox 里。
 * 6：新实体 attachment（Task 附件，ADR-0019）与 Blob 通道。最低协议不变：
 *    旧客户端跳过 attachment 变更，升级后迁移触发一次 bootstrap 取回。
 */
export const SYNC_PROTOCOL_VERSION = 6;

/**
 * hub 认识 attachment 的协议版本：副本迁移后第一次连上这样的 hub 时走
 * 一次 bootstrap（见 LocalReplica.consumeResync）。
 */
export const ATTACHMENT_PROTOCOL = 6;

/**
 * hub 完成 Tag Group → 父 Tag 迁移的协议版本：副本迁移后第一次连上这样
 * 的 hub 时走一次 bootstrap（见 LocalReplica.consumeResync）。
 */
export const TAG_TREE_PROTOCOL = 5;

/** hub 按数值裁决 HLC 的协议版本（设备据此触发小数时钟修复）。 */
export const NUMERIC_HLC_PROTOCOL = 3;

/**
 * hub 变更日志的保留期（天）：cursor 早于被清理部分的设备走 bootstrap。
 * hub 的 Compact 登记与日志同期清理，设备的登记多留两天（见
 * COMPACT_REGISTRY_RETENTION_DAYS）。
 */
export const SYNC_LOG_RETENTION_DAYS = 30;

/**
 * 设备 Compact 登记的保留期（天，自本机登记时算起）。hub 在 Compact
 * Event 被日志清理时删除登记；设备登记不早于 hub，保留得比 hub 久，
 * Repeat 派生不会在 hub 仍拒绝某个 id 时复用它（local-first-v3 issue 08）。
 */
export const COMPACT_REGISTRY_RETENTION_DAYS = SYNC_LOG_RETENTION_DAYS + 2;

/**
 * 请求头：协议版本（整数）与客户端标识（`desktop/1.2.3`）。用 header
 * 而不是请求体字段：hub 的 DTO 校验拒绝未知字段，旧 hub 会把带新字段
 * 的请求整批 400；GET（pull / bootstrap）也没有请求体。
 */
export const SYNC_PROTOCOL_HEADER = 'x-taskora-sync-protocol';
export const SYNC_CLIENT_HEADER = 'x-taskora-client';

/** hub 在每个同步响应里回报的版本信息（协议 1 起）。 */
export interface HubVersionInfo {
  /** hub 实现的协议版本。 */
  protocolVersion?: number;
  /** hub 仍接受的最低协议版本；低于它的请求得到 HTTP 426。 */
  minProtocolVersion?: number;
}

/**
 * hub 过旧、无法处理的一条变更（协议 1 起）：设备把它留在 Outbox 里，
 * 以后的同步照常重推，hub 升级后自然接受——不丢、不卡住其余变更。
 */
export interface RejectedChange {
  kind: 'write' | 'delete';
  entity: string;
  id: string;
  /** unknown-entity：整条被拒；unknown-fields：已认识的字段已合并，fields 列出被丢弃的。 */
  reason: 'unknown-entity' | 'unknown-fields';
  fields?: string[];
}

/**
 * 客户端协议版本低于 hub 的最低版本（HTTP 426）。同步停止、Outbox 保留，
 * UI 提示升级；本地读写不受影响。
 */
export class SyncUpgradeRequiredError extends Error {
  readonly name = 'SyncUpgradeRequiredError';

  constructor(readonly minProtocolVersion?: number) {
    super('同步协议版本过旧，请升级 Taskora');
  }
}

/** Outbox 中的一条 Change Event：实体 + 字段级时间戳写。 */
export interface OutboxEvent {
  entity: SyncEntity;
  id: string;
  /** field → {value, hlc}。 */
  fields: Record<string, FieldWrite>;
}

/**
 * Delete Request（设备 → hub，ADR-0008）：设备发起的物理删除请求，
 * 携带实体类型与一批 id。hub 校验归属后物理删除，并按现有机制广播
 * Compact Event。与设备端软删除（trashedAt 等普通字段变更）相对。
 */
export interface DeleteRequest {
  entity: SyncEntity;
  ids: string[];
}

/** 设备 → hub：推送一批本地变更。 */
export interface PushRequest {
  deviceId: string;
  events: OutboxEvent[];
  /** 设备发起的物理删除（ADR-0008）。hub 先合并 events、再应用 deletes。 */
  deletes?: DeleteRequest[];
}

export interface PushResponse extends HubVersionInfo {
  /** hub 接受（或已持有）的事件数。 */
  acked: number;
  /** hub 无法处理的变更（协议 1 起；缺省即全部接受）。 */
  rejected?: RejectedChange[];
  /**
   * hub 处理请求时的服务器时间（毫秒）。设备据此校准 HLC 墙钟，以 hub
   * 时间为各设备的共同基准（ADR-0007）。
   */
  serverTime?: number;
}

/** hub → 设备：一个实体的合并态变更（完整字段 + 完整时钟）。 */
export interface EntityChange extends EntityMergeState {
  kind: 'entity';
  seq: number;
  entity: SyncEntity;
  id: string;
}

/**
 * Compact Event（压缩变更）：hub 的 GC 物理删除后下发「从副本移除这批
 * id」。线上唯一的非字段级变更类型。
 */
export interface CompactChange {
  kind: 'compact';
  seq: number;
  entity: SyncEntity;
  ids: string[];
}

export type HubChange = EntityChange | CompactChange;

/** 设备 → hub：凭 Sync Cursor 拉取增量。 */
export interface PullRequest {
  cursor: number;
}

export interface PullResponse extends HubVersionInfo {
  changes: HubChange[];
  /** 本次覆盖到的最新 seq（含 resync 时为当前 seq）。 */
  cursor: number;
  /** 序号缺口超出 hub 保留范围（或 cursor 来自别的 hub 世代）→ 设备必须走 bootstrap 重建。 */
  resync: boolean;
  /** 本页之后还有变更：设备应以新 cursor 继续 pull。 */
  hasMore?: boolean;
  /**
   * hub 处理请求时的服务器时间（毫秒）。设备据此校准 HLC 墙钟，以 hub
   * 时间为各设备的共同基准（ADR-0007）。
   */
  serverTime?: number;
}

/** hub → 设备：全量快照（新设备 / 重置副本的设备）。 */
export interface SnapshotEntry extends EntityMergeState {
  entity: SyncEntity;
  id: string;
}

/** 设备 → hub：取快照的一页（协议 2 起）。 */
export interface BootstrapRequest {
  /** 上一页响应的 next；缺省为第一页。 */
  page?: string;
  /**
   * 归档截止时刻（ISO）：在此之前了结的任务不进快照（规则见 archive.ts
   * 的 isArchivedTask）。只在第一页生效，后续页沿用令牌里记下的值。
   */
  settledAfter?: string;
}

/**
 * 快照的一页。第一页之前 hub 固定 cursor fence，各页的 cursor 都是它；
 * 读取期间发生的变更 seq 都大于 fence，设备应用完快照后在 pull 里重放。
 */
export interface BootstrapResponse extends HubVersionInfo {
  snapshot: SnapshotEntry[];
  cursor: number;
  /** 还有下一页：设备以它为 page 继续请求。缺省即最后一页（旧 hub 恒为整包）。 */
  next?: string;
  /**
   * 已被永久 compact 的 id。设备重建副本时据此拒绝回放相同 id 的
   * 待同步字段写，避免 bootstrap 把已删除实体在本地复活。
   */
  compacted?: DeleteRequest[];
  /**
   * hub 处理请求时的服务器时间（毫秒）。设备据此校准 HLC 墙钟，以 hub
   * 时间为各设备的共同基准（ADR-0007）。
   */
  serverTime?: number;
}

/**
 * 设备 → hub：按 id 取实体的合并态（协议 2 起）。归档任务被远端修改、
 * 回到副本时，设备用它补齐任务及其级联子实体（Subtask）。
 */
export interface FetchEntitiesRequest {
  entity: SyncEntity;
  ids: string[];
}

export interface FetchEntitiesResponse extends HubVersionInfo {
  /** 仍存在的实体及其 DELETE_CASCADES 子实体；不存在的 id 不出现。 */
  entries: SnapshotEntry[];
  serverTime?: number;
}

/** Engine 侧的同步传输层（HTTP/SSE 实现 live in 桌面端；测试用进程内 hub）。 */
export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  bootstrap(request?: BootstrapRequest): Promise<BootstrapResponse>;
  /** 缺省（或旧 hub 不支持）时，回到副本的归档任务不补齐子实体。 */
  fetchEntities?(request: FetchEntitiesRequest): Promise<FetchEntitiesResponse>;
}
