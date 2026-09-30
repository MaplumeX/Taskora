import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  planConvertTaskToProject,
  planRepeatInstance,
  planTaskComplete,
  planTaskCreate,
  planTaskUpdate,
  repeatInstanceId,
  sortForView,
  taskCancelPatch,
  taskMatchesQuery,
  taskReopenPatch,
  taskRestorePatch,
  taskTrashPatch,
  viewNeedsCalendar,
} from '@taskora/engine';
import { TaskStatus } from '@taskora/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService, type HubWriteBatch } from '../sync/sync-hub.service';
import {
  calendarContextFor,
  newRowOrder,
  orderFields,
  toWireFields,
} from '../common/domain-storage';
import { userCalendarZones } from '../users/account-time-zone';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import {
  buildTaskViewWhere,
  hidesTasksInLaterProjects,
  laterProjectIds,
  WITH_SETTLED_STATUSES,
} from './views';
import { parseRepeatRule, settledToCompletedAt, withRepeatRuleDto } from './task-dto.mapper';

/** 派生路径需要的 Task 行形状（含标签关系与子任务）。 */
type TaskRowWithChildren = Prisma.TaskGetPayload<{
  include: { tags: true; subtasks: { orderBy: { sortOrder: 'asc' } } };
}>;

const WITH_TAGS = { tags: { include: { tag: true } } } as const;

/**
 * 任务的 REST 写路径（web 与 Agent）。领域规则（bucket、计划、生命周期、
 * 重复派生、转项目、列表过滤）来自 @taskora/engine 的 domain 纯函数，与
 * 设备的 Engine 后端共用（local-first-v3 issue 04）；写入经 Sync Hub 的
 * 合并器（虚拟设备 0，issue 05），这里只负责读 Postgres、调规则、提交
 * 字段写。
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  /** 写后的列表 DTO（标签展开、settledAt → completedAt、规则解析）。 */
  private async listDto(client: Prisma.TransactionClient | PrismaService, id: string) {
    const row = await client.task.findUniqueOrThrow({ where: { id }, include: WITH_TAGS });
    return settledToCompletedAt(withRepeatRuleDto({ ...row, tags: row.tags.map((tt) => tt.tag) }));
  }

  /**
   * Repeat Instance 服务端派生（ADR-0012）：web 无法本地派生，完成路径由
   * 服务端代为派生（规则见 domain planRepeatInstance），与设备派生产出
   * 同一确定性 id，经 hub 字段级 LWW 自然收敛。parent 取结算前的状态。
   */
  private async deriveRepeatInstance(
    batch: HubWriteBatch,
    userId: string,
    parent: TaskRowWithChildren,
    settledAt: string,
  ): Promise<void> {
    const repeatRule = parseRepeatRule(parent.repeatRule);
    if (!repeatRule) return; // 非重复任务：不必查账户时区
    const plan = planRepeatInstance(
      {
        id: parent.id,
        title: parent.title,
        notes: parent.notes,
        scheduledDate: parent.scheduledDate,
        repeatRule,
        reminderTime: parent.reminderTime,
        projectId: parent.projectId,
        headingId: parent.headingId,
        areaId: parent.areaId,
        tagIds: parent.tags.map((tt) => tt.tagId),
      },
      parent.subtasks,
      settledAt,
      await userCalendarZones(this.prisma, userId),
    );
    if (!plan) return;
    const existing = await batch.tx.task.findFirst({
      where: { id: plan.id, userId },
      select: { id: true },
    });
    if (existing) return; // 幂等（restore 后重完成 / 并发派生）
    // 确定性 id 已被 compact（重开删除过该实例后重新完成）：设备副本上
    // 无法复活（ADR-0008 Compact 永久获胜），换新 id——唯一的复活路径。
    const compacted = await batch.tx.compactedEntity.findFirst({
      where: { userId, entity: 'task', entityId: plan.id },
      select: { entityId: true },
    });
    const instanceId = compacted ? randomUUID() : plan.id;

    const maxSort = await batch.tx.task.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    // 派生实例进入列表末尾（新位次，不继承父任务位次）
    await batch.write('task', instanceId, {
      ...toWireFields(plan.task),
      ...newRowOrder((maxSort._max.sortOrder ?? -1) + 1),
    });
    for (const { id, ...subtask } of plan.subtasksFor(instanceId)) {
      await batch.write('subtask', id, subtask);
    }
  }

  /**
   * 取消派生副作用（ADR-0012）：重开删除其派生实例——与 Delete Request
   * 同一路径（Compact 登记、级联 Subtask）。不存在则无操作（纯取消从未
   * 派生）。
   */
  private async deleteDerivedInstance(
    batch: HubWriteBatch,
    userId: string,
    parent: {
      id: string;
      repeatRule: string | null;
      scheduledDate: Date | null;
      settledAt: Date | null;
    },
  ): Promise<void> {
    const repeatRule = parseRepeatRule(parent.repeatRule);
    if (!repeatRule) return; // 非重复任务：从未派生
    const target = repeatInstanceId(
      { id: parent.id, scheduledDate: parent.scheduledDate, repeatRule },
      parent.settledAt ? parent.settledAt.toISOString() : null,
      await userCalendarZones(this.prisma, userId),
    );
    if (target) await batch.delete('task', [target.id]);
  }

  /** 读本用户的任务，不存在即 404。 */
  private async requireTask(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    id: string,
  ) {
    const task = await client.task.findFirst({ where: { id, userId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async create(userId: string, dto: CreateTaskDto) {
    const fields = planTaskCreate(dto, await userCalendarZones(this.prisma, userId));
    const id = randomUUID();
    return this.hub.writeAsHub(userId, async (batch) => {
      // 新任务的位次口径不变：sortOrder 0 + 同口径合成的 Position
      await batch.write('task', id, { ...toWireFields(fields), ...newRowOrder(0) });
      return this.listDto(batch.tx, id);
    });
  }

  async findAll(userId: string, query: TaskQueryDto) {
    const where: Prisma.TaskWhereInput = { userId };

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.view) {
      const viewWhere = buildTaskViewWhere(query.view);
      Object.assign(where, viewWhere);
    } else {
      if (query.projectId) where.projectId = query.projectId;
      if (query.areaId) where.areaId = query.areaId;
      if (query.tagId) {
        where.tags = { some: { tagId: query.tagId } };
      }
      if (query.hasScheduled === true) {
        where.scheduledDate = { not: null };
      }
      if (query.q) {
        // q mode: default ACTIVE; completed=true → 已了结三值白名单
        // （ACTIVE / COMPLETED / CANCELLED，见 ADR 0006）。
        where.status = query.completed ? { in: [...WITH_SETTLED_STATUSES] } : TaskStatus.ACTIVE;
        where.trashedAt = null;
      } else if (!query.completed) {
        where.status = TaskStatus.ACTIVE;
        where.trashedAt = null;
      } else {
        // include both active and completed when explicitly requested
        where.trashedAt = null;
      }
    }

    const orderBy =
      query.view === 'logbook'
        ? [{ settledAt: 'desc' as const }]
        : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];

    const hideLaterProjectTasks = hidesTasksInLaterProjects(query.view);
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy,
      include: { tags: { include: { tag: true } } },
    });
    // SQL 只是粗筛；最终过滤按 domain taskMatchesQuery（与设备同一规则）
    const context = await calendarContextFor(
      this.prisma,
      userId,
      viewNeedsCalendar(query.view) || hideLaterProjectTasks,
    );
    // 稍后项目内的任务在 Anytime / Someday 中随父项目休眠（Later Project）。
    const hiddenProjectIds = hideLaterProjectTasks
      ? await laterProjectIds(this.prisma, userId, context, context.now)
      : new Set<string>();
    const visible = tasks.filter(
      (task) =>
        (!task.projectId || !hiddenProjectIds.has(task.projectId)) &&
        taskMatchesQuery({ ...task, tagIds: task.tags.map((tt) => tt.tagId) }, query, context),
    );
    return sortForView(visible, query.view, (task) => task.settledAt).map((t) =>
      settledToCompletedAt(withRepeatRuleDto({ ...t, tags: t.tags.map((tt) => tt.tag) })),
    );
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        subtasks: { orderBy: { sortOrder: 'asc' } },
        tags: { include: { tag: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const { tags: taskTags, subtasks, ...rest } = task;
    return settledToCompletedAt({
      ...withRepeatRuleDto(rest),
      tags: taskTags.map((tt) => tt.tag),
      subtasks: subtasks.map(settledToCompletedAt),
    });
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const existing = await this.requireTask(this.prisma, userId, id);
    const patch = planTaskUpdate(existing, dto, await userCalendarZones(this.prisma, userId));
    return this.hub.writeAsHub(userId, async (batch) => {
      // 全量 set 语义：tagIds 传 undefined 不动；传数组则整组替换
      await batch.write('task', id, toWireFields(patch));
      return this.listDto(batch.tx, id);
    });
  }

  async remove(userId: string, id: string) {
    await this.requireTask(this.prisma, userId, id);
    const now = new Date();
    await this.hub.writeAsHub(userId, (batch) =>
      batch.write('task', id, toWireFields(taskTrashPatch(now.toISOString()))),
    );
    return { id, trashedAt: now };
  }

  async restore(userId: string, id: string) {
    await this.requireTask(this.prisma, userId, id);
    await this.hub.writeAsHub(userId, (batch) =>
      batch.write('task', id, toWireFields(taskRestorePatch())),
    );
    return { id, trashedAt: null };
  }

  async convertToProject(userId: string, id: string) {
    const zones = await userCalendarZones(this.prisma, userId);
    return this.hub.writeAsHub(userId, async (batch) => {
      const existing = await batch.tx.task.findFirst({
        where: { id, userId },
        include: { tags: true, subtasks: { orderBy: { sortOrder: 'asc' } }, project: true },
      });
      if (!existing) {
        throw new NotFoundException('Task not found');
      }
      const plan = planConvertTaskToProject(
        {
          title: existing.title,
          notes: existing.notes,
          scheduledType: existing.scheduledType,
          scheduledDate: existing.scheduledDate,
          dueDate: existing.dueDate,
          status: existing.status,
          settledAt: existing.settledAt?.toISOString() ?? null,
          trashedAt: existing.trashedAt?.toISOString() ?? null,
          areaId: existing.areaId,
          tagIds: existing.tags.map((tt) => tt.tagId),
        },
        existing.project?.areaId ?? null,
        existing.subtasks.map((subtask) => ({
          title: subtask.title,
          status: subtask.status,
          settledAt: subtask.settledAt?.toISOString() ?? null,
        })),
        zones,
      );

      // 新项目排在末尾（sortOrder = max + 1）
      const maxSort = await batch.tx.project.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const now = new Date();
      const projectId = randomUUID();
      await batch.write('project', projectId, {
        ...toWireFields(plan.project),
        ...newRowOrder((maxSort._max.sortOrder ?? -1) + 1, now),
      });

      // 提升出的任务保持原 Subtask 的顺序
      for (const [index, promoted] of plan.promotedTasks.entries()) {
        await batch.write('task', randomUUID(), {
          ...toWireFields({ ...promoted, projectId }),
          ...newRowOrder(index, now),
        });
      }

      // 原 Task 物理删除（级联 Subtask、Compact 登记），与新项目同事务
      await batch.delete('task', [id]);

      const project = await batch.tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: WITH_TAGS,
      });
      return { ...project, tags: project.tags.map((pt) => pt.tag) };
    });
  }

  async complete(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        tags: true,
        subtasks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const settledAt = new Date().toISOString();
    const plan = planTaskComplete(existing.status, settledAt);
    if (!plan) {
      // 已完成（双击 / 重试）：不改写了结时间，不二次派生
      const { tags, subtasks, ...row } = existing;
      void tags;
      void subtasks;
      return settledToCompletedAt(withRepeatRuleDto(row));
    }
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('task', id, toWireFields(plan.patch));
      if (plan.deriveRepeat) await this.deriveRepeatInstance(batch, userId, existing, settledAt);
      return settledToCompletedAt(
        withRepeatRuleDto(await batch.tx.task.findUniqueOrThrow({ where: { id } })),
      );
    });
  }

  async uncomplete(userId: string, id: string) {
    return this.reopen(userId, id);
  }

  async cancel(userId: string, id: string) {
    await this.requireTask(this.prisma, userId, id);
    // 取消父 Task 不改动其 Subtasks（CONTEXT.md）；不派生，链就此终结
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('task', id, toWireFields(taskCancelPatch(new Date().toISOString())));
      return settledToCompletedAt(
        withRepeatRuleDto(await batch.tx.task.findUniqueOrThrow({ where: { id } })),
      );
    });
  }

  async uncancel(userId: string, id: string) {
    return this.reopen(userId, id);
  }

  /** 重开（取消完成 / 取消取消）：先删除已派生的实例（ADR-0012），同一事务。 */
  private async reopen(userId: string, id: string) {
    const existing = await this.requireTask(this.prisma, userId, id);
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.deleteDerivedInstance(batch, userId, existing);
      await batch.write('task', id, toWireFields(taskReopenPatch()));
      return settledToCompletedAt(
        withRepeatRuleDto(await batch.tx.task.findUniqueOrThrow({ where: { id } })),
      );
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.task.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, createdAt: true },
    });
    const ownedSet = new Set(owned.map((t) => t.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Task not found');
    }

    // 双排序键一起写：sortOrder 是 web 端 REST 读序列，position 是设备
    // 副本读序列（fractional indexing），写入值与 hub 的合成函数一致。
    const createdAtOf = new Map(owned.map((t) => [t.id, t.createdAt]));
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const [index, id] of orderedIds.entries()) {
        await batch.write('task', id, orderFields(index, createdAtOf.get(id)!));
      }
    });
  }
}
