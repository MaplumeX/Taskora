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

import type { FieldClocks, FieldWrite } from './merger';
import type { SyncEntity } from './entities';

/** Outbox 中的一条 Change Event：实体 + 字段级时间戳写。 */
export interface OutboxEvent {
  entity: SyncEntity;
  id: string;
  /** field → {value, hlc}。 */
  fields: Record<string, FieldWrite>;
}

/** 设备 → hub：推送一批本地变更。 */
export interface PushRequest {
  deviceId: string;
  events: OutboxEvent[];
}

export interface PushResponse {
  /** hub 接受（或已持有）的事件数。 */
  acked: number;
}

/** hub → 设备：一个实体的合并态变更（完整字段 + 完整时钟）。 */
export interface EntityChange {
  kind: 'entity';
  seq: number;
  entity: SyncEntity;
  id: string;
  fields: Record<string, unknown>;
  clocks: FieldClocks;
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

export interface PullResponse {
  changes: HubChange[];
  /** 本次覆盖到的最新 seq（含 resync 时为当前 seq）。 */
  cursor: number;
  /** 序号缺口超出 hub 缓冲（或 hub 重启）→ 设备必须走 bootstrap 重建。 */
  resync: boolean;
}

/** hub → 设备：全量快照（新设备 / 重置副本的设备）。 */
export interface SnapshotEntry {
  entity: SyncEntity;
  id: string;
  fields: Record<string, unknown>;
  clocks: FieldClocks;
}

export interface BootstrapResponse {
  snapshot: SnapshotEntry[];
  cursor: number;
}

/** Engine 侧的同步传输层（HTTP/SSE 实现 live in 桌面端；测试用进程内 hub）。 */
export interface SyncTransport {
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  bootstrap(): Promise<BootstrapResponse>;
}
