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
  DELETE_CASCADES,
  type FieldWrite,
  type DeleteRequest,
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

  /**
   * 设备推送一批变更：先逐事件按字段级 LWW 合并入 Postgres，再应用
   * Delete Request（ADR-0008 同序：字段写 → 删除）。单个事件失败
   * （如悬挂引用）只丢弃该事件，不阻塞整个 Outbox 的收敛。
   */
  async push(
    userId: string,
    events: OutboxEvent[],
    deletes?: DeleteRequest[],
  ): Promise<{ acked: number }> {
    for (const event of events) {
      try {
        await this.applyEvent(userId, event);
      } catch (error) {
        console.error('[sync-hub] 事件合并失败，丢弃', event.entity, event.id, error);
      }
    }
    for (const deleteRequest of deletes ?? []) {
      try {
        await this.applyDeleteRequest(userId, deleteRequest);
      } catch (error) {
        console.error('[sync-hub] Delete Request 处理失败', deleteRequest.entity, error);
      }
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

  // ---------- hub 侧写入（GC Compact / 虚拟设备 0 / Delete Request） ----------

  /**
   * hub GC 物理删除后下发 Compact Event（清空 Trash / 级联清理）。
   * 同时登记 CompactedEntity（ADR-0008）：迟到的设备字段写被静默丢弃。
   * 发布同步、登记异步 best-effort——事件下发不等登记。
   */
  async publishCompact(userId: string, entity: SyncEntity, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    void this.registerCompacted(userId, entity, ids).catch((error) => {
      console.error('[sync-hub] compact 登记失败', entity, error);
    });
    this.buffer.publish(userId, { kind: 'compact', seq: 0, entity, ids });
  }

  /** 虚拟设备 0（Assistant）提交字段级写：与设备推送同一合并路径。 */
  async submitVirtualWrite(userId: string, event: OutboxEvent): Promise<void> {
    await this.applyEvent(userId, event);
  }

  // ---------- 设备发起删除（Delete Request，ADR-0008） ----------

  /**
   * 处理 Delete Request：校验实体归属后物理删除，登记 CompactedEntity
   * 并广播 Compact Event（每用户单调 seq）。Task 级联删除其 Subtask
   * （与 hub GC 同惯例）。越权（不属于该用户）的 id 被拒绝——不删除、
   * 不广播。幂等：重复请求（实体已不存在）为 no-op。
   */
  private async applyDeleteRequest(userId: string, request: DeleteRequest): Promise<void> {
    const ids = [...new Set(request.ids)];
    if (ids.length === 0) return;
    const codec = codecFor(request.entity);

    // 归属校验（story 6）：只删属于该用户的行（Subtask 经父 Task 认领）
    const rows = (await delegate(this.prisma, codec.model).findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ...(codec.entity === 'subtask' ? { task: { select: { userId: true } } } : { userId: true }),
      },
    })) as Array<{ id: string } & Record<string, unknown>>;
    const owned = rows
      .filter((row) =>
        codec.entity === 'subtask'
          ? (row.task as { userId: string } | null)?.userId === userId
          : row.userId === userId,
      )
      .map((row) => row.id);

    // 级联（对齐 hub GC 惯例）：Task → Subtask；Subtask 先删，父 Task
    // 的归属路由（ownerTaskId）在其消失前完成。
    const cascadedSubtaskIds: string[] = [];
    for (const rule of DELETE_CASCADES[request.entity] ?? []) {
      const childCodec = codecFor(rule.entity);
      const childRows = (await delegate(this.prisma, childCodec.model).findMany({
        where: { [rule.foreignKey]: { in: owned } },
        select: { id: true },
      })) as Array<{ id: string }>;
      cascadedSubtaskIds.push(...childRows.map((row) => row.id));
      if (cascadedSubtaskIds.length > 0) {
        await delegate(this.prisma, childCodec.model).deleteMany({
          where: { id: { in: cascadedSubtaskIds } },
        });
      }
    }

    // 物理删除：关联（TaskTag/ProjectTag/AreaTag/Subtask）走 onDelete:
    // Cascade 自动清理；Task/Project 的删除经 collector tap 转 Compact
    // Event（设备端从副本移除）。
    if (owned.length > 0) {
      await delegate(this.prisma, codec.model).deleteMany({ where: { id: { in: owned } } });
    }

    // 级联删除的 Subtask 无 collector 事件可依赖：父 Task 在同一窗口内
    // 消失时 ownerTaskId 路由解析不到归属（与 emptyTrash 同惯例），
    // 因此显式登记 + 广播。重复 Compact 对副本幂等。
    // 只登记归属校验通过的 id（story 6：越权 id 不进请求者的登记表）。
    await this.registerCompacted(userId, request.entity, owned);
    if (cascadedSubtaskIds.length > 0) {
      await this.registerCompacted(userId, 'subtask', cascadedSubtaskIds);
      await this.publishCompact(userId, 'subtask', cascadedSubtaskIds);
    }
  }

  /** 登记 Compact（幂等，skipDuplicates）：此后该实体的迟到字段写被丢弃。 */
  private async registerCompacted(
    userId: string,
    entity: SyncEntity,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.compactedEntity.createMany({
      data: ids.map((entityId) => ({ userId, entity, entityId })),
      skipDuplicates: true,
    });
  }

  /** 查询某实体 id 是否已被 compact（迟到写丢弃，ADR-0008）。 */
  private async isCompacted(
    userId: string,
    entity: SyncEntity,
    entityId: string,
  ): Promise<boolean> {
    const row = await this.prisma.compactedEntity.findUnique({
      where: { userId_entity_entityId: { userId, entity, entityId } },
      select: { id: true },
    });
    return row !== null;
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
      // 物理删除 → Compact Event + 登记（设备端从副本移除；迟到写丢弃）
      await this.publishCompact(userId, entity, [id]);
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
    // Compact 永久获胜（ADR-0008）：已 compact 的实体，迟到的字段写
    // 静默丢弃（不重建、不发事件）。
    if (!row && (await this.isCompacted(userId, event.entity, event.id))) return;
    const current = row ? serializeRow(codec, row) : null;

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
    data.updatedAt = new Date(Math.max(0, ...Object.values(outcome.clocks).map(hlcWallMs)) + 1);

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
        {
          kind: 'entity',
          seq: 0,
          entity: event.entity,
          id: event.id,
          fields: state.fields,
          clocks: state.clocks,
        },
        fingerprint(state),
      );
    }
  }
}

function fingerprint(state: {
  fields: Record<string, unknown>;
  clocks: Record<string, string>;
}): string {
  return JSON.stringify([state.fields, state.clocks]);
}

function digestMap(
  codec: ReturnType<typeof codecFor>,
  fields: Record<string, unknown>,
): Record<string, string> {
  const digests: Record<string, string> = {};
  for (const def of codec.def.fields) {
    digests[def.name] = JSON.stringify(fields[def.name] ?? null);
  }
  return digests;
}
