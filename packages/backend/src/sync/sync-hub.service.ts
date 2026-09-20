/**
 * Sync Hub — 服务端在 local-first 架构中的角色（ADR-0007）。
 *
 * 接收各设备推送的 Change Event、按字段级 LWW 合并入 Postgres 副本、
 * 供设备拉取；同时作为第 0 号虚拟设备的写入路径。REST CRUD（含
 * Assistant 直调 Prisma 的写）通过 collector tap 进入同一推流：序列化
 * 时由时钟基线机制（entity-codec）赋予虚拟设备 0 的合并语义，无特权
 * 写入路径。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';

import {
  mergeFieldWrites,
  hlcWallMs,
  SYNC_ENTITIES,
  type FieldWrite,
  type OutboxEvent,
  type SyncEntity,
} from '@taskora/engine';
import type { ChangeAction, ChangeEntity } from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { ChangeEventHub } from '../events/change-event-hub.service';
import {
  codecFor,
  delegate,
  loadAllRows,
  loadRow,
  serializeRow,
  toPrismaData,
} from './entity-codec';
import { SyncEventBuffer } from './sync-event-buffer.service';

const CHANGE_ENTITY_TO_SYNC: Record<ChangeEntity, SyncEntity> = {
  task: 'task',
  subtask: 'subtask',
  project: 'project',
  'project-heading': 'project-heading',
  area: 'area',
  tag: 'tag',
  'tag-group': 'tag-group',
};

/** 无 userId 列的实体（Subtask 经父 Task 认领归属）。 */
const NO_USER_ID_ENTITIES = new Set<SyncEntity>(['subtask']);

@Injectable()
export class SyncHubService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buffer: SyncEventBuffer,
    private readonly changeEventHub: ChangeEventHub,
  ) {}

  /** 订阅 REST/Assistant 的 Prisma 写（collector → 旧 Event Stream 的同一份事件）。 */
  onModuleInit(): void {
    this.changeEventHub.tap((userId, event) => {
      void this.handleTap(userId, event.entity, event.action, event.id).catch((error) => {
        console.error('[sync-hub] tap 处理失败', event, error);
      });
    });
  }

  // ---------- 设备协议面 ----------

  /** 设备推送一批 Change Events：逐事件按字段级 LWW 合并入 Postgres。 */
  async push(userId: string, events: OutboxEvent[]): Promise<{ acked: number }> {
    for (const event of events) {
      await this.applyEvent(userId, event);
    }
    return { acked: events.length };
  }

  /** 设备凭 Sync Cursor 拉取增量。 */
  pull(userId: string, cursor: number) {
    return this.buffer.pull(userId, cursor);
  }

  /** 全量快照（新设备 / 重置副本的设备 bootstrap）。 */
  async bootstrap(userId: string) {
    const snapshot: Array<{
      entity: SyncEntity;
      id: string;
      fields: Record<string, unknown>;
      clocks: Record<string, string>;
    }> = [];
    for (const entity of SYNC_ENTITIES) {
      const codec = codecFor(entity);
      const rows = await loadAllRows(this.prisma, codec, userId);
      for (const row of rows) {
        const state = serializeRow(codec, row);
        snapshot.push({ entity, id: row.id as string, fields: state.fields, clocks: state.clocks });
      }
    }
    return { snapshot, cursor: this.buffer.currentSeq(userId) };
  }

  /** 设备注册：登录时分配/续期 device id（ADR-0007）。 */
  async registerDevice(userId: string, deviceId: string, label?: string) {
    await this.prisma.device.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, label },
      update: { label, lastSeenAt: new Date() },
    });
    return { deviceId };
  }

  // ---------- hub 侧写入（GC Compact / 虚拟设备 0） ----------

  /** hub GC 物理删除后下发 Compact Event（清空 Trash / 级联清理）。 */
  publishCompact(userId: string, entity: SyncEntity, ids: string[]): void {
    if (ids.length === 0) return;
    this.buffer.publish(userId, { kind: 'compact', seq: 0, entity, ids });
  }

  /** 虚拟设备 0（Assistant）提交字段级写：与设备推送同一合并路径。 */
  async submitVirtualWrite(userId: string, event: OutboxEvent): Promise<void> {
    await this.applyEvent(userId, event);
  }

  // ---------- 内部 ----------

  /** collector tap：REST/Assistant 写 → 序列化并入同步推流。 */
  private async handleTap(
    userId: string,
    changeEntity: ChangeEntity,
    action: ChangeAction,
    id: string,
  ): Promise<void> {
    const entity = CHANGE_ENTITY_TO_SYNC[changeEntity];
    if (action === 'deleted') {
      // 物理删除 → Compact Event（设备端从副本移除）
      this.buffer.publish(userId, { kind: 'compact', seq: 0, entity, ids: [id] });
      return;
    }
    const codec = codecFor(entity);
    const row = await loadRow(this.prisma, codec, id);
    if (!row) return; // 已被后续删除覆盖
    const state = serializeRow(codec, row);
    this.buffer.publish(
      userId,
      { kind: 'entity', seq: 0, entity, id, fields: state.fields, clocks: state.clocks },
      fingerprint(state),
    );
  }

  /** 单事件合并：load → mergeFieldWrites → 写回 → 发布 EntityChange。 */
  private async applyEvent(userId: string, event: OutboxEvent): Promise<void> {
    const codec = codecFor(event.entity);
    // 防御：只接受注册表内的字段（设备侧 bug 不应击穿 hub 列）
    const incoming: Record<string, FieldWrite> = {};
    for (const [field, write] of Object.entries(event.fields)) {
      if (codec.def.fields.some((def) => def.name === field) && typeof write?.hlc === 'string') {
        incoming[field] = write;
      }
    }
    if (Object.keys(incoming).length === 0) return;

    const row = await loadRow(this.prisma, codec, event.id);
    const current = row
      ? serializeRow(codec, row)
      : null;

    const outcome = mergeFieldWrites(
      current ? { fields: current.fields, clocks: current.clocks } : null,
      incoming,
    );
    if (outcome.appliedFields.length === 0) {
      return; // 纯重放：合并态未变，不写库、不发事件
    }

    const data = toPrismaData(codec, outcome.fields, outcome.appliedFields);
    data.fieldClocks = outcome.clocks;
    data.fieldDigests = digestMap(codec, outcome.fields);
    // updatedAt 不超过最大时钟墙钟：REST 写检测（摘要不匹配才重置基线）
    // 不会被自己的合并写误触发。
    data.updatedAt = new Date(
        Math.max(0, ...Object.values(outcome.clocks).map(hlcWallMs)) + 1,
      );

    if (row) {
      await delegate(this.prisma, codec.model).update({ where: { id: event.id }, data });
    } else if (NO_USER_ID_ENTITIES.has(event.entity)) {
      // Subtask 无 userId 列：归属经父 Task 认领（不属于该用户则拒绝）。
      const taskId = outcome.fields.taskId;
      if (typeof taskId !== 'string') return;
      const parent = await loadRow(this.prisma, codecFor('task'), taskId);
      if (!parent || parent.userId !== userId) return;
      await delegate(this.prisma, codec.model).create({ data: { ...data, id: event.id } });
    } else {
      await delegate(this.prisma, codec.model).create({
        data: { ...data, id: event.id, userId },
      });
    }

    // 发布写库后的真实序列化态（单一事实来源，含合成 Position）
    const fresh = await loadRow(this.prisma, codec, event.id);
    if (fresh) {
      const state = serializeRow(codec, fresh);
      this.buffer.publish(
        userId,
        { kind: 'entity', seq: 0, entity: event.entity, id: event.id, fields: state.fields, clocks: state.clocks },
        fingerprint(state),
      );
    }
  }
}

function fingerprint(state: { fields: Record<string, unknown>; clocks: Record<string, string> }): string {
  return JSON.stringify([state.fields, state.clocks]);
}

function digestMap(codec: ReturnType<typeof codecFor>, fields: Record<string, unknown>): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const def of codec.def.fields) {
    digests[def.name] = JSON.stringify(fields[def.name] ?? null);
  }
  return digests;
}


