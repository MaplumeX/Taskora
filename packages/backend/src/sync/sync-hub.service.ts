/**
 * Sync Hub — 服务端在 local-first 架构中的角色（ADR-0007）。
 *
 * 接收各设备推送的 Change Event、按字段级 LWW 合并入 Postgres 副本、
 * 供设备拉取；同时是第 0 号虚拟设备的写入路径：REST 服务（web 与
 * Assistant）经 writeAsHub 提交字段写与物理删除，与设备推送走同一个
 * 合并器，变更日志与数据同事务提交（local-first-v3 issue 05）。没有
 * 绕过合并器的写入路径。
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
  type WireRow,
} from '@taskora/engine';

import { PrismaService } from '../prisma/prisma.service';
import {
  codecFor,
  delegate,
  loadAllRows,
  loadRow,
  sameWireValue,
  serializeRow,
  toPrismaData,
  wireViewOfRow,
  type PrismaRow,
  type SerializedState,
} from './entity-codec';
import { registerCompacted } from './compact-registry';
import { materializeLegacyClocks } from './legacy-clock-backfill';
import { SyncChangeLog, type HubChangeDraft } from './sync-change-log';

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

/**
 * REST 写入批（虚拟设备 0）的事务上限。批内每行一次加锁读合并写，
 * 级联（清空 Trash、整页重排）可能涉及数百行，Prisma 默认的 5 秒不够。
 */
const HUB_WRITE_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

/**
 * 一次 REST 写入（web / Assistant）在 hub 上的事务批：批内的字段写与
 * 物理删除和它们的变更日志一起提交或一起回滚。
 */
export interface HubWriteBatch {
  /** 批内读取用的事务客户端（能读到本批已写的行）。 */
  readonly tx: Prisma.TransactionClient;
  /**
   * 字段写（行不存在即新建）：hub 在行锁内以虚拟设备 0 盖章——时间戳
   * 高于该行现有的全部字段时钟（用户是看着这些值做的修改，因果在后）——
   * 再走与设备推送相同的合并、引用清洗与不变量修复。值未变的字段不写。
   * 行属于其他用户或已被 compact 时静默忽略（调用方先做归属校验）。
   */
  write(entity: SyncEntity, id: string, fields: WireRow): Promise<void>;
  /** 物理删除：与 Delete Request 同一路径（归属校验、级联、Compact 登记）。 */
  delete(entity: SyncEntity, ids: string[]): Promise<void>;
}

/** 单行合并的输入：设备推送的带时钟字段写，或待 hub 盖章的虚拟设备 0 写。 */
type MergeInput =
  { kind: 'device'; fields: Record<string, FieldWrite> } | { kind: 'virtual'; fields: WireRow };

@Injectable()
export class SyncHubService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly log: SyncChangeLog,
  ) {}

  /**
   * 启动时把旧版本留下的「值摘要」物化为字段时钟（一次性，处理完的行
   * fieldDigests 置空）。此后所有写都经合并器、时钟即权威，序列化不再
   * 做摘要检测。Nest 在开始监听前等待它完成。
   */
  async onModuleInit(): Promise<void> {
    const migrated = await materializeLegacyClocks(this.prisma);
    if (migrated > 0) console.log(`[sync-hub] 已物化 ${migrated} 行旧摘要时钟`);
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
        rejected.push({
          kind: 'write',
          entity: event.entity,
          id: event.id,
          reason: 'unknown-entity',
        });
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
          rejected.push({
            kind: 'delete',
            entity: deleteRequest.entity,
            id,
            reason: 'unknown-entity',
          });
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

  // ---------- hub 侧写入（虚拟设备 0 / Delete Request） ----------

  /**
   * REST 写入（web 与 Assistant，虚拟设备 0）：run 里的字段写与物理删除
   * 在同一个事务里经合并器落库，变更日志随数据一起提交——提交即可被
   * pull 到，崩溃不会只丢日志不丢数据。run 抛错则整批回滚。
   */
  async writeAsHub<T>(userId: string, run: (batch: HubWriteBatch) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const changes = new ChangeBuffer();
      const result = await run({
        tx,
        write: async (entity, id, fields) => {
          changes.add(await this.mergeRow(tx, userId, entity, id, { kind: 'virtual', fields }));
        },
        delete: async (entity, ids) => {
          changes.addAll(await this.deleteRows(tx, userId, entity, ids));
        },
      });
      await this.log.append(tx, userId, changes.drain());
      return result;
    }, HUB_WRITE_TX_OPTIONS);
  }

  // ---------- 设备发起删除（Delete Request，ADR-0008） ----------

  /**
   * 处理 Delete Request：校验实体归属后物理删除，登记 CompactedEntity
   * 并广播 Compact Event（每用户单调 seq）。Task 级联删除其 Subtask
   * （与 hub GC 同惯例）。越权（不属于该用户）的 id 被拒绝——不删除、
   * 不广播。幂等：重复请求（实体已不存在）为 no-op。
   */
  private async applyDeleteRequest(userId: string, request: DeleteRequest): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.log.append(
        tx,
        userId,
        await this.deleteRows(tx, userId, request.entity, request.ids),
      );
    });
  }

  /** 事务内的物理删除；返回待入日志的 Compact Event。 */
  private async deleteRows(
    tx: unknown,
    userId: string,
    entity: SyncEntity,
    requestedIds: string[],
  ): Promise<HubChangeDraft[]> {
    const ids = [...new Set(requestedIds)];
    if (ids.length === 0) return [];
    const codec = codecFor(entity);
    for (const id of [...ids].sort()) await this.lockEntity(tx, userId, entity, id);

    // 归属校验（story 6）：只删属于该用户的行（Subtask 经父 Task 认领）
    const rows = (await delegate(tx, codec.model).findMany({
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

    // 级联子实体（DELETE_CASCADES：Task → Subtask、Project →
    // ProjectHeading）：登记 + 物理删除同事务，按实体分组广播
    const cascaded: Array<{ entity: SyncEntity; ids: string[] }> = [];
    for (const rule of DELETE_CASCADES[entity] ?? []) {
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
    // 一起回滚。
    await registerCompacted(tx, userId, entity, owned);
    if (owned.length > 0) {
      await delegate(tx, codec.model).deleteMany({ where: { id: { in: owned } } });
    }
    const changes: HubChangeDraft[] = [];
    if (owned.length > 0) changes.push(compactChange(entity, owned));
    for (const group of cascaded) changes.push(compactChange(group.entity, group.ids));
    return changes;
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

  /** 设备推送的单事件合并：独立事务，合并结果与日志同事务提交。 */
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

    await this.prisma.$transaction(async (tx) => {
      const change = await this.mergeRow(tx, userId, event.entity, event.id, {
        kind: 'device',
        fields: incoming,
      });
      if (change) await this.log.append(tx, userId, [change]);
    });
  }

  /**
   * 单行合并（事务内）：加锁 load → 字段级 LWW → 引用清洗 → 不变量修复
   * → 写回。返回待入日志的变更（合并态未变时为 null）。
   */
  private async mergeRow(
    tx: unknown,
    userId: string,
    entity: SyncEntity,
    id: string,
    input: MergeInput,
  ): Promise<HubChangeDraft | null> {
    const codec = codecFor(entity);
    await this.lockEntity(tx, userId, entity, id);
    const row = await loadRow(tx, codec, id);
    // 归属校验（story 6 对偶，字段写与 Delete Request 同口径）：行存在
    // 但属于其他用户（Subtask 经父 Task 认领）时静默丢弃。
    if (row && !(await this.ownsRow(tx, userId, entity, row))) return null;
    // Compact 永久获胜：已 compact 的实体不重建。推送方显然还持有这行
    // （如重启前的旧版本复用了已死的确定性 id），重发 Compact Event
    // 让它收敛，而不是留下永远不同步的本地幽灵行。
    if (!row && (await this.isCompacted(tx, userId, entity, id))) {
      return compactChange(entity, [id]);
    }
    const current = row ? serializeRow(codec, row) : null;
    const incoming =
      input.kind === 'device' ? input.fields : this.stampVirtualWrite(codec, current, input.fields);
    if (Object.keys(incoming).length === 0) return null;

    const outcome = mergeFieldWrites(
      current ? { fields: current.fields, clocks: current.clocks } : null,
      incoming,
    );
    // 失效引用清洗（REFERENCE_FIELDS）：设备离线期间的写可能引用此后
    // 被 compact（或从未存在且永不会到达）的实体——直接物化会触发
    // FK violation，整批 push 反复失败（同步毒丸）。尚未到达的引用
    // （同批后序事件可能创建）保留，由 FK 失败驱动重试收敛（既有
    // 语义）。先批量预加载引用状态，再清洗。
    const referenceStatuses = await this.loadReferenceStatuses(tx, userId, entity, outcome);
    const bumpWall = 1 + Math.max(Date.now(), ...Object.values(outcome.clocks).map(hlcWallMs));
    const bumpClock = () =>
      formatHlc({ wallMs: bumpWall, counter: 0, deviceId: VIRTUAL_DEVICE_ID });
    const handled = scrubReferences(
      entity,
      current ? { fields: current.fields, clocks: current.clocks } : null,
      outcome,
      (target, refId) => referenceStatuses.get(`${target}:${refId}`) ?? 'pending',
      bumpClock,
    );
    if (!handled) return null; // 孤儿 Subtask：整事件丢弃
    // 跨字段不变量（local-first-v3 issue 01）：合并出的组合违反业务规则
    // （别的项目的分组、Someday 带提醒……）时纠正，以必胜时钟下发。
    const headingOwner = await this.loadHeadingOwner(tx, entity, outcome.fields);
    applyRepairs(
      entity,
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
    // 旧版的值摘要作废（见 legacy-clock-backfill）：清空即「时钟已权威」。
    data.fieldDigests = Prisma.DbNull;
    // 补丁未携带 updatedAt 时才兜底：避免 Prisma @updatedAt 自动取 hub
    // 墙钟，使时钟与列值失去确定性。携带时保持设备值原样落库——回声
    // 平局下两端值也一致。
    if (data.updatedAt === undefined) {
      data.updatedAt = new Date(Math.max(0, ...Object.values(outcome.clocks).map(hlcWallMs)));
    }

    if (row) {
      await delegate(tx, codec.model).update({ where: { id }, data });
    } else if (NO_USER_ID_ENTITIES.has(entity)) {
      // Subtask 无 userId 列：归属经父 Task 认领。
      const taskId = outcome.fields.taskId;
      if (typeof taskId !== 'string') return null;
      const parent = await loadRow(tx, codecFor('task'), taskId);
      if (!parent || parent.userId !== userId) return null;
      await delegate(tx, codec.model).create({ data: { ...data, id } });
    } else {
      await delegate(tx, codec.model).create({ data: { ...data, id, userId } });
    }

    // 落库后的真实状态入日志：不可空列的 Prisma 默认值（sortOrder null
    // → 0）、tagIds 关系表排序、日期格式都以列值为准。
    const fresh = await loadRow(tx, codec, id);
    if (!fresh) return null;
    // 被剔除的字段（新版客户端的未知枚举值、非法日期等）：库里留的是旧值
    // 或列默认值，时钟却是推送方的。推送方拉回声时时钟持平、保留本地
    // 非法值，两端永久分叉。与引用清洗同一机制：以虚拟设备 0 的必胜时钟
    // 下发实际落库值，推送方随之收敛。只看被剔除的字段——已接受字段的
    // 格式差异（如日期）不能提升时钟，否则每次回声都会被当作远端写。
    const wire = wireViewOfRow(codec, fresh);
    const corrected: Record<string, string> = {};
    for (const field of rejected) {
      if (JSON.stringify(wire[field] ?? null) === JSON.stringify(outcome.fields[field] ?? null)) {
        continue;
      }
      corrected[field] = bumpClock();
    }
    let state: SerializedState;
    if (Object.keys(corrected).length > 0) {
      const clocks = { ...outcome.clocks, ...corrected };
      // 显式回写 updatedAt：列是 @updatedAt，否则这次 UPDATE 会把它推到 now()。
      await delegate(tx, codec.model).update({
        where: { id },
        data: { fieldClocks: clocks, updatedAt: fresh.updatedAt as Date },
      });
      state = serializeRow(codec, { ...fresh, fieldClocks: clocks });
    } else {
      state = serializeRow(codec, fresh);
    }
    return { kind: 'entity', entity, id, fields: state.fields, clocks: state.clocks };
  }

  /**
   * 虚拟设备 0 的字段写盖章。时间戳高于行上现有的全部字段时钟（REST
   * 调用方读到了这些值，写在因果上晚于它们），因此必胜——包括时钟
   * 超前的设备留下的时间戳。值与当前相同的字段不写（不制造无意义的
   * 变更，也不压掉并发中的设备写）；有实际变化时补上 updatedAt。
   */
  private stampVirtualWrite(
    codec: ReturnType<typeof codecFor>,
    current: SerializedState | null,
    fields: WireRow,
  ): Record<string, FieldWrite> {
    const known = new Set(codec.def.fields.map((def) => def.name));
    const changed: WireRow = {};
    for (const [field, value] of Object.entries(fields)) {
      if (!known.has(field) || value === undefined) continue;
      if (current && sameWireValue(codec, field, current.fields[field], value)) continue;
      changed[field] = value;
    }
    if (Object.keys(changed).length === 0) return {};
    const now = Date.now();
    if (changed.updatedAt === undefined) changed.updatedAt = new Date(now).toISOString();
    if (!current && changed.createdAt === undefined) changed.createdAt = changed.updatedAt;
    const floor = current ? Object.values(current.clocks).map(hlcWallMs) : [];
    const hlc = formatHlc({
      wallMs: Math.max(now, ...floor.map((wall) => wall + 1)),
      counter: 0,
      deviceId: VIRTUAL_DEVICE_ID,
    });
    return Object.fromEntries(
      Object.entries(changed).map(([field, value]) => [field, { value, hlc }]),
    );
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
}

function compactChange(entity: SyncEntity, ids: string[]): HubChangeDraft {
  return { kind: 'compact', entity, ids };
}

/**
 * 一个写入批的待入日志变更。同一实体在批内多次写入时只保留最后一次的
 * 状态（它已包含之前的写）；Compact 按发生顺序保留。
 */
class ChangeBuffer {
  private readonly changes: Array<HubChangeDraft | null> = [];
  private readonly entityIndex = new Map<string, number>();

  add(change: HubChangeDraft | null): void {
    if (!change) return;
    if (change.kind === 'entity') {
      const key = `${change.entity}:${change.id}`;
      const previous = this.entityIndex.get(key);
      if (previous !== undefined) this.changes[previous] = null;
      this.entityIndex.set(key, this.changes.length);
    }
    this.changes.push(change);
  }

  addAll(changes: HubChangeDraft[]): void {
    changes.forEach((change) => this.add(change));
  }

  drain(): HubChangeDraft[] {
    return this.changes.filter((change): change is HubChangeDraft => change !== null);
  }
}
