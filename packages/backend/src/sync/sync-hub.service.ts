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
  applyRepairs,
  hlcWallMs,
  formatHlc,
  scrubReferences,
  SYNC_ENTITIES,
  DELETE_CASCADES,
  REFERENCE_FIELDS,
  VIRTUAL_DEVICE_ID,
  isSyncEntity,
  type FieldWrite,
  type DeleteRequest,
  type OutboxEvent,
  type ReferenceStatus,
  type RejectedChange,
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
  wireViewOfRow,
  type PrismaRow,
} from './entity-codec';
import { registerCompacted } from './compact-registry';
import { SyncChangeLog, type HubChangeDraft } from './sync-change-log';

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

/** Prisma 模型对应的 PostgreSQL 表名；仅用于事务内 SELECT ... FOR UPDATE。 */
const PRISMA_TABLE_NAMES: Record<SyncEntity, string> = {
  task: 'Task',
  subtask: 'Subtask',
  project: 'Project',
  'project-heading': 'ProjectHeading',
  area: 'Area',
  tag: 'Tag',
  'tag-group': 'TagGroup',
};

@Injectable()
export class SyncHubService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: SyncChangeLog,
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
   * Delete Request（ADR-0008 同序：字段写 → 删除）。单个事件失败时继续
   * 尝试同批后续事件，但最终让请求失败，使设备保留整批并幂等重试。
   *
   * 本 hub 不认识的实体 / 字段（更新版本的客户端，协议 1）逐条拒绝并在
   * rejected 里列出：设备把它们留在 Outbox，hub 升级后重推即被接受。
   * 认识的字段照常合并。
   */
  async push(
    userId: string,
    events: Array<{ entity: string; id: string; fields: OutboxEvent['fields'] }>,
    deletes?: Array<{ entity: string; ids: string[] }>,
  ): Promise<{ acked: number; rejected?: RejectedChange[] }> {
    const rejected: RejectedChange[] = [];
    let firstFailure: unknown = null;
    for (const event of events) {
      if (!isSyncEntity(event.entity)) {
        rejected.push({ kind: 'write', entity: event.entity, id: event.id, reason: 'unknown-entity' });
        continue;
      }
      const known = new Set(codecFor(event.entity).def.fields.map((def) => def.name));
      const unknownFields = Object.keys(event.fields).filter((field) => !known.has(field));
      if (unknownFields.length > 0) {
        rejected.push({
          kind: 'write',
          entity: event.entity,
          id: event.id,
          reason: 'unknown-fields',
          fields: unknownFields,
        });
      }
      try {
        await this.applyEvent(userId, { ...event, entity: event.entity });
      } catch (error) {
        firstFailure ??= error;
        console.error('[sync-hub] 事件合并失败，将由设备重试', event.entity, event.id, error);
      }
    }
    for (const deleteRequest of deletes ?? []) {
      if (!isSyncEntity(deleteRequest.entity)) {
        for (const id of deleteRequest.ids) {
          rejected.push({ kind: 'delete', entity: deleteRequest.entity, id, reason: 'unknown-entity' });
        }
        continue;
      }
      try {
        await this.applyDeleteRequest(userId, { ...deleteRequest, entity: deleteRequest.entity });
      } catch (error) {
        firstFailure ??= error;
        console.error('[sync-hub] Delete Request 处理失败', deleteRequest.entity, error);
      }
    }
    // 同批后续事件仍会尝试执行：它们可能正是前面悬挂引用所依赖的父实体。
    // 只要有一条失败，整个 HTTP 请求失败，设备保留原批次并幂等重放。
    if (firstFailure !== null) throw firstFailure;
    if (rejected.length > 0) {
      console.warn('[sync-hub] 拒绝本 hub 不认识的变更（客户端协议更新）', userId, rejected);
    }
    const rejectedWrites = rejected.filter(
      (item) => item.kind === 'write' && item.reason === 'unknown-entity',
    ).length;
    return {
      acked: events.length - rejectedWrites,
      ...(rejected.length > 0 ? { rejected } : {}),
    };
  }

  /** 设备凭 Sync Cursor 拉取增量。 */
  pull(userId: string, cursor: number) {
    return this.log.pull(userId, cursor);
  }

  /** 全量快照（新设备 / 重置副本的设备 bootstrap）。 */
  async bootstrap(userId: string) {
    // 先固定 fence：此后发生的任何发布都带更大 seq，设备应用快照后仍会
    // 在下一次 pull 中重放，不会出现“旧快照 + 新 cursor”的永久漏事件。
    const cursor = await this.log.currentSeq(userId);
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
    const compactedRows = (await this.prisma.compactedEntity.findMany({
      where: { userId },
      select: { entity: true, entityId: true },
    })) as Array<{ entity: string; entityId: string }>;
    const compactedByEntity = new Map<SyncEntity, string[]>();
    for (const row of compactedRows) {
      if (!isSyncEntity(row.entity)) continue;
      const ids = compactedByEntity.get(row.entity) ?? [];
      ids.push(row.entityId);
      compactedByEntity.set(row.entity, ids);
    }
    return {
      snapshot,
      cursor,
      compacted: [...compactedByEntity].map(([entity, ids]) => ({ entity, ids })),
    };
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

  /** hub GC 物理删除后：持久登记与 Compact Event 同事务写入。 */
  async publishCompact(userId: string, entity: SyncEntity, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    // 只写 compact 登记与日志（collector 不观察的表）：走 rawTransaction，
    // 不在 tap 里重入 collector 的事务作用域。
    await this.prisma.rawTransaction(async (tx) => {
      await registerCompacted(tx, userId, entity, ids);
      await this.log.append(tx, userId, [compactChange(entity, ids)]);
    });
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
    await this.prisma.$transaction(async (tx) => {
      for (const id of [...ids].sort()) await this.lockEntity(tx, userId, request.entity, id);

      // 归属校验（story 6）：只删属于该用户的行（Subtask 经父 Task 认领）
      const rows = (await delegate(tx, codec.model).findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          ...(codec.entity === 'subtask'
            ? { task: { select: { userId: true } } }
            : { userId: true }),
        },
      })) as Array<{ id: string } & Record<string, unknown>>;
      const owned = rows
        .filter((row) =>
          codec.entity === 'subtask'
            ? (row.task as { userId: string } | null)?.userId === userId
            : row.userId === userId,
        )
        .map((row) => row.id);

      // 级联子实体（DELETE_CASCADES：Task → Subtask、Project →
      // ProjectHeading）：登记 + 物理删除同事务，按实体分组广播
      const cascaded: Array<{ entity: SyncEntity; ids: string[] }> = [];
      for (const rule of DELETE_CASCADES[request.entity] ?? []) {
        const childCodec = codecFor(rule.entity);
        const childRows = (await delegate(tx, childCodec.model).findMany({
          where: { [rule.foreignKey]: { in: owned } },
          select: { id: true },
        })) as Array<{ id: string }>;
        const childIds = childRows.map((row) => row.id);
        await registerCompacted(tx, userId, rule.entity, childIds);
        if (childIds.length > 0) {
          cascaded.push({ entity: rule.entity, ids: childIds });
          await delegate(tx, childCodec.model).deleteMany({ where: { id: { in: childIds } } });
        }
      }

      // 登记、物理删除与 Compact Event 同事务提交；登记在前，删除失败会
      // 一起回滚。collector 随后的重复 Compact 对设备幂等。
      await registerCompacted(tx, userId, request.entity, owned);
      if (owned.length > 0) {
        await delegate(tx, codec.model).deleteMany({ where: { id: { in: owned } } });
      }
      const changes: HubChangeDraft[] = [];
      if (owned.length > 0) changes.push(compactChange(request.entity, owned));
      for (const group of cascaded) changes.push(compactChange(group.entity, group.ids));
      await this.log.append(tx, userId, changes);
    });
  }

  /** 查询某实体 id 是否已被 compact（迟到写丢弃，ADR-0008）。 */
  private async isCompacted(
    client: unknown,
    userId: string,
    entity: SyncEntity,
    entityId: string,
  ): Promise<boolean> {
    const row = await delegate(client, 'compactedEntity').findUnique({
      where: { userId_entity_entityId: { userId, entity, entityId } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * 行归属校验：已存在的行是否属于该用户（Subtask 无 userId 列，经
   * 父 Task 认领）。字段写与 Delete Request 适用同一规则（story 6）。
   */
  private async ownsRow(
    client: unknown,
    userId: string,
    entity: SyncEntity,
    row: PrismaRow,
  ): Promise<boolean> {
    if (entity === 'subtask') {
      const parent = await loadRow(client, codecFor('task'), row.taskId as string);
      return (parent as { userId?: string } | null)?.userId === userId;
    }
    return row.userId === userId;
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
    // 去重：设备推送的写已在合并事务里入日志，collector 随后的回声内容
    // 相同，不再重复记一条（尽力而为：指纹只在本进程内）。
    const key = `${userId}:${entity}:${id}`;
    const print = fingerprint(state);
    if (this.lastFingerprint.get(key) === print) return;
    await this.prisma.rawTransaction(async (tx) => {
      await this.log.append(tx, userId, [
        { kind: 'entity', entity, id, fields: state.fields, clocks: state.clocks },
      ]);
    });
    this.rememberFingerprint(key, print);
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

    const state = await this.prisma.$transaction(async (tx) => {
      await this.lockEntity(tx, userId, event.entity, event.id);
      const row = await loadRow(tx, codec, event.id);
      // 归属校验（story 6 对偶，字段写与 Delete Request 同口径）：行存在
      // 但属于其他用户（Subtask 经父 Task 认领）时静默丢弃。
      if (row && !(await this.ownsRow(tx, userId, event.entity, row))) return null;
      // Compact 永久获胜：已 compact 的实体不重建。推送方显然还持有这行
      // （如重启前的旧版本复用了已死的确定性 id），重发 Compact Event
      // 让它收敛，而不是留下永远不同步的本地幽灵行。
      if (!row && (await this.isCompacted(tx, userId, event.entity, event.id))) {
        await this.log.append(tx, userId, [compactChange(event.entity, [event.id])]);
        return null;
      }
      const current = row ? serializeRow(codec, row) : null;

      const outcome = mergeFieldWrites(
        current ? { fields: current.fields, clocks: current.clocks } : null,
        incoming,
      );
      // 失效引用清洗（REFERENCE_FIELDS）：设备离线期间的写可能引用此后
      // 被 compact（或从未存在且永不会到达）的实体——直接物化会触发
      // FK violation，整批 push 反复失败（同步毒丸）。尚未到达的引用
      // （同批后序事件可能创建）保留，由 FK 失败驱动重试收敛（既有
      // 语义）。先批量预加载引用状态，再清洗。
      const referenceStatuses = await this.loadReferenceStatuses(tx, userId, event.entity, outcome);
      const bumpWall = 1 + Math.max(Date.now(), ...Object.values(outcome.clocks).map(hlcWallMs));
      const bumpClock = () =>
        formatHlc({ wallMs: bumpWall, counter: 0, deviceId: VIRTUAL_DEVICE_ID });
      const handled = scrubReferences(
        event.entity,
        current ? { fields: current.fields, clocks: current.clocks } : null,
        outcome,
        (target, id) => referenceStatuses.get(`${target}:${id}`) ?? 'pending',
        bumpClock,
      );
      if (!handled) return null; // 孤儿 Subtask：整事件丢弃
      // 跨字段不变量（local-first-v3 issue 01）：合并出的组合违反业务规则
      // （别的项目的分组、Someday 带提醒……）时纠正，以必胜时钟下发。
      const headingOwner = await this.loadHeadingOwner(tx, event.entity, outcome.fields);
      applyRepairs(
        event.entity,
        outcome,
        (headingId) => (headingId === headingOwner?.id ? headingOwner.projectId : undefined),
        bumpClock,
      );
      if (outcome.appliedFields.length === 0) return null;

      // 新建行走 create 模式：tagIds 只物化为纯 create。
      const rejected: string[] = [];
      const data = toPrismaData(
        codec,
        outcome.fields,
        outcome.appliedFields,
        row ? 'update' : 'create',
        rejected,
      );
      data.fieldClocks = outcome.clocks;
      // 补丁未携带 updatedAt 时（如虚拟设备 0 的部分写）才兑底：避免
      // Prisma @updatedAt 自动取 hub 墙钟，使时钟与列值失去确定性。
      // 携带时保持设备值原样落库——回声平局下两端值也一致。
      if (data.updatedAt === undefined) {
        data.updatedAt = new Date(Math.max(0, ...Object.values(outcome.clocks).map(hlcWallMs)));
      }

      if (row) {
        await delegate(tx, codec.model).update({ where: { id: event.id }, data });
      } else if (NO_USER_ID_ENTITIES.has(event.entity)) {
        // Subtask 无 userId 列：归属经父 Task 认领。
        const taskId = outcome.fields.taskId;
        if (typeof taskId !== 'string') return null;
        const parent = await loadRow(tx, codecFor('task'), taskId);
        if (!parent || parent.userId !== userId) return null;
        await delegate(tx, codec.model).create({ data: { ...data, id: event.id } });
      } else {
        await delegate(tx, codec.model).create({ data: { ...data, id: event.id, userId } });
      }

      // 落库值摘要回填（回声幂等的关键）：fieldDigests 必须按「实际落库
      // 的列值」的 wire 视图计算，而非设备推送值——不可空列的 Prisma
      // 默认值（如 sortOrder null → 0）、tagIds 关系表排序都会使列值 ≠
      // 推送值。若按推送值存摘要，serializeRow 的摘要检测会把这次合并
      // 写误判为「REST 绕过合并器」，将字段时钟重置为虚拟设备 0 @
      // updatedAt——设备 pull 回自己的回声时时钟反而更新，被当作远端
      // 写应用，触发 onChange → 全域失效 → 界面「同步后刷新一下」。
      // 回填后摘要匹配，时钟保持合并结果，回声在设备端逐字段持平 →
      // 零应用、零通知。
      const fresh = await loadRow(tx, codec, event.id);
      if (!fresh) return null;
      const wire = wireViewOfRow(codec, fresh);
      const digests = digestMap(codec, wire);
      // 被剔除的字段（新版客户端的未知枚举值、非法日期等）：库里留的是旧值
      // 或列默认值，时钟却是推送方的。推送方拉回声时时钟持平、保留本地
      // 非法值，两端永久分叉。与引用清洗同一机制：以虚拟设备 0 的必胜时钟
      // 下发实际落库值，推送方随之收敛。只看被剔除的字段——已接受字段的
      // 格式差异（如日期）不能提升时钟，否则每次回声都会被当作远端写。
      const clocks = { ...outcome.clocks };
      let corrected = false;
      for (const field of rejected) {
        if (JSON.stringify(wire[field] ?? null) === JSON.stringify(outcome.fields[field] ?? null)) {
          continue;
        }
        clocks[field] = formatHlc({ wallMs: bumpWall, counter: 0, deviceId: VIRTUAL_DEVICE_ID });
        corrected = true;
      }
      // 显式回写 updatedAt：列是 @updatedAt，否则这次 UPDATE 会把列值
      // 推到真实 now()，重新制造摘要不一致。
      await delegate(tx, codec.model).update({
        where: { id: event.id },
        data: {
          fieldDigests: digests,
          updatedAt: fresh.updatedAt as Date,
          ...(corrected ? { fieldClocks: clocks } : {}),
        },
      });
      // 写库后的真实序列化态（摘要已回填 → 时钟保持合并结果），与数据
      // 同事务入日志：提交即可被 pull 到，崩溃也不会只丢变更不丢数据。
      const merged = serializeRow(codec, {
        ...fresh,
        fieldDigests: digests,
        ...(corrected ? { fieldClocks: clocks } : {}),
      });
      await this.log.append(tx, userId, [
        {
          kind: 'entity',
          entity: event.entity,
          id: event.id,
          fields: merged.fields,
          clocks: merged.clocks,
        },
      ]);
      return merged;
    });

    if (state) {
      this.rememberFingerprint(`${userId}:${event.entity}:${event.id}`, fingerprint(state));
    }
  }

  /**
   * 批量预加载 applied 字段引用的目标状态（ReferenceStatus）。
   * - 行存在且属于该用户：alive；
   * - 行不存在且已登记 compact：dead（迟到引用，清洗对象）；
   * - 行不存在且未登记：pending（同批后序事件可能创建，保留引用
   *   由 FK 失败驱动重试）；
   * - 行存在但属于他人：dead（越权引用，不物化）。
   */
  private async loadReferenceStatuses(
    tx: unknown,
    userId: string,
    entity: SyncEntity,
    outcome: { appliedFields: string[]; fields: Record<string, unknown> },
  ): Promise<Map<string, ReferenceStatus>> {
    const refs = REFERENCE_FIELDS[entity];
    const statuses = new Map<string, ReferenceStatus>();
    if (!refs) return statuses;
    const scalarTargets = new Map<SyncEntity, Set<string>>();
    const arrayTargets = new Map<SyncEntity, Set<string>>();
    const add = (map: Map<SyncEntity, Set<string>>, target: SyncEntity, ids: string[]) => {
      if (ids.length === 0) return;
      const set = map.get(target) ?? new Set<string>();
      ids.forEach((id) => set.add(id));
      map.set(target, set);
    };
    for (const field of outcome.appliedFields) {
      const ref = refs[field];
      if (!ref) continue;
      const value = outcome.fields[field];
      if (ref.array) {
        add(
          arrayTargets,
          ref.entity,
          Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [],
        );
      } else if (typeof value === 'string') {
        add(scalarTargets, ref.entity, [value]);
      }
    }
    // 标量引用：逐个 findUnique + 归属校验（复用 ownsRow 的认领口径）
    for (const [target, ids] of scalarTargets) {
      for (const id of ids) {
        const row = await loadRow(tx, codecFor(target), id);
        if (row) {
          statuses.set(
            `${target}:${id}`,
            (await this.ownsRow(tx, userId, target, row)) ? 'alive' : 'dead',
          );
        } else {
          statuses.set(
            `${target}:${id}`,
            (await this.isCompacted(tx, userId, target, id)) ? 'dead' : 'pending',
          );
        }
      }
    }
    // 数组引用（tagIds）：一次批量查询存活集，缺失集再查 compact 登记
    for (const [target, ids] of arrayTargets) {
      const codec = codecFor(target);
      const rows = (await delegate(tx, codec.model).findMany({
        where: { id: { in: [...ids] }, userId },
        select: { id: true },
      })) as Array<{ id: string }>;
      const owned = new Set(rows.map((row) => row.id));
      ids.forEach((id) => {
        if (owned.has(id)) statuses.set(`${target}:${id}`, 'alive');
      });
      const missing = [...ids].filter((id) => !owned.has(id));
      if (missing.length > 0) {
        const compactedRows = (await delegate(tx, 'compactedEntity').findMany({
          where: { userId, entity: target, entityId: { in: missing } },
          select: { entityId: true },
        })) as Array<{ entityId: string }>;
        const compacted = new Set(compactedRows.map((row) => row.entityId));
        missing.forEach((id) => {
          statuses.set(`${target}:${id}`, compacted.has(id) ? 'dead' : 'pending');
        });
      }
    }
    return statuses;
  }

  /** 任务所挂分组的归属项目（R4 探针；非任务 / 无分组 / 分组不存在时为 null）。 */
  private async loadHeadingOwner(
    tx: unknown,
    entity: SyncEntity,
    fields: Record<string, unknown>,
  ): Promise<{ id: string; projectId: string } | null> {
    if (entity !== 'task' || typeof fields.headingId !== 'string') return null;
    const heading = await loadRow(tx, codecFor('project-heading'), fields.headingId);
    return heading && typeof heading.projectId === 'string'
      ? { id: fields.headingId, projectId: heading.projectId }
      : null;
  }

  /** 同一实体的跨实例事务锁；行存在时再取 FOR UPDATE，与普通 REST 写互斥。 */
  private async lockEntity(
    client: unknown,
    userId: string,
    entity: SyncEntity,
    id: string,
  ): Promise<void> {
    const query = (
      client as { $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown> }
    ).$queryRawUnsafe;
    await query.call(
      client,
      'SELECT 1 AS "locked" WHERE pg_advisory_xact_lock(hashtext($1), hashtext($2)) IS NULL',
      `${userId}:${entity}`,
      id,
    );
    await query.call(
      client,
      `SELECT "id" FROM "${PRISMA_TABLE_NAMES[entity]}" WHERE "id" = $1 FOR UPDATE`,
      id,
    );
  }

  /** 最近一次入日志的实体内容指纹（collector 回声去重；有界 LRU）。 */
  private readonly lastFingerprint = new Map<string, string>();

  private rememberFingerprint(key: string, print: string): void {
    this.lastFingerprint.delete(key);
    this.lastFingerprint.set(key, print);
    if (this.lastFingerprint.size > FINGERPRINT_CACHE_SIZE) {
      const oldest = this.lastFingerprint.keys().next().value;
      if (oldest !== undefined) this.lastFingerprint.delete(oldest);
    }
  }
}

const FINGERPRINT_CACHE_SIZE = 10_000;

function compactChange(entity: SyncEntity, ids: string[]): HubChangeDraft {
  return { kind: 'compact', entity, ids };
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
