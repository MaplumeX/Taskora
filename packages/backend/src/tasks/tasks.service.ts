import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  planConvertTaskToProject,
  planRepeatInstance,
  planReorder,
  planRepeatSkip,
  planTaskComplete,
  planTaskCreate,
  planTaskDuplicate,
  planTaskSearch,
  planTaskUpdate,
  positionAfterRow,
  positionBetween,
  positionsBetween,
  repeatDerivationTarget,
  hasSearchCriteria,
  sortForView,
  subtaskStatusPatch,
  tagParentsFrom,
  taskCancelPatch,
  taskMatchesQuery,
  taskReopenPatch,
  taskRestorePatch,
  taskTrashPatch,
  keepsSettledInViews,
  type TagParents,
  type TaskSearchOptions,
} from '@taskora/engine';
import { TaskStatus } from '@taskora/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService, type HubWriteBatch } from '../sync/sync-hub.service';
import { calendarContextFor, edgePositions, toWireFields } from '../common/domain-storage';
import { sortByPosition } from '../common/position-order';
import { userCalendarZones, userReviewSettings } from '../users/account-time-zone';
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
  include: { tags: true; subtasks: true; attachments: true };
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
    if (!repeatRule) return; // 非重复任务：不必查账号时区
    const plan = planRepeatInstance(
      {
        id: parent.id,
        title: parent.title,
        notes: parent.notes,
        scheduledDate: parent.scheduledDate,
        dueDate: parent.dueDate,
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
      parent.attachments,
    );
    if (!plan) return;
    const linked = await batch.tx.task.findFirst({
      where: { userId, repeatSourceId: parent.id, trashedAt: null },
      select: { id: true },
    });
    const plannedRow = await batch.tx.task.findFirst({
      where: { id: plan.id, userId },
      select: { trashedAt: true },
    });
    const compacted =
      !plannedRow &&
      (await batch.tx.compactedEntity.findFirst({
        where: { userId, entity: 'task', entityId: plan.id },
        select: { entityId: true },
      })) !== null;
    const target = repeatDerivationTarget({
      hasLinkedInstance: linked !== null,
      plannedId: plannedRow
        ? plannedRow.trashedAt
          ? 'trashed'
          : 'live'
        : compacted
          ? 'compacted'
          : 'absent',
    });
    if (target === 'skip') return;
    const instanceId = target === 'planned' ? plan.id : randomUUID();

    // 派生实例进入列表末尾（新位次，不继承父任务位次）
    const { last } = await edgePositions(batch.tx, 'Task', userId);
    await batch.write('task', instanceId, {
      ...toWireFields(plan.task),
      position: positionBetween(last, null),
    });
    for (const { id, ...subtask } of plan.subtasksFor(instanceId)) {
      await batch.write('subtask', id, subtask);
    }
    for (const { id, ...attachment } of plan.attachmentsFor(instanceId)) {
      await batch.write('attachment', id, attachment);
    }
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
      // 新任务追加到末尾（与设备 Engine 后端同一口径）
      const { last } = await edgePositions(batch.tx, 'Task', userId);
      await batch.write('task', id, {
        ...toWireFields(fields),
        position: positionBetween(last, null),
      });
      return this.listDto(batch.tx, id);
    });
  }

  async findAll(userId: string, query: TaskQueryDto) {
    const where: Prisma.TaskWhereInput = { userId };
    // tagId 查询的继承来源与 Tag 树（SQL 粗筛与最终判定共用）
    const parents = query.tagId && !query.view ? await this.tagParents(userId) : undefined;
    const context = await calendarContextFor(this.prisma, userId);
    const keepsSettled = keepsSettledInViews(context);

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { notes: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.view) {
      const viewWhere = buildTaskViewWhere(query.view, keepsSettled);
      Object.assign(where, viewWhere);
    } else {
      if (query.projectId) where.projectId = query.projectId;
      if (query.areaId) where.areaId = query.areaId;
      if (query.tagId && parents) {
        // 有效 Tag（ADR 0015）：自身，或继承所属 Project / Area 的 Tag；
        // 命中该 Tag 的整棵子树（嵌套 Tag，ADR-0016）
        const hasTag = { some: { tagId: { in: [...parents.subtreeOf(query.tagId)] } } };
        where.AND = [
          {
            OR: [
              { tags: hasTag },
              { project: { tags: hasTag } },
              { project: { area: { tags: hasTag } } },
              { area: { tags: hasTag } },
            ],
          },
        ];
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
        // 非立即模式下还留着尚未移入 Logbook 的已了结任务（ADR 0022）
        if (!keepsSettled) where.status = TaskStatus.ACTIVE;
        where.trashedAt = null;
      } else {
        // include both active and completed when explicitly requested
        where.trashedAt = null;
      }
    }

    const orderBy = query.view === 'logbook' ? [{ settledAt: 'desc' as const }] : undefined; // 其余视图由 sortForView 按 Position 排

    const hideLaterProjectTasks = hidesTasksInLaterProjects(query.view);
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy,
      include: { tags: { include: { tag: true } } },
    });
    // SQL 只是粗筛；最终过滤按 domain taskMatchesQuery（与设备同一规则）
    // 稍后项目内的任务在 Anytime / Someday 中随父项目休眠（Later Project）。
    const hiddenProjectIds = hideLaterProjectTasks
      ? await laterProjectIds(this.prisma, userId, context, context.now)
      : new Set<string>();
    const visible = tasks.filter(
      (task) =>
        (!task.projectId || !hiddenProjectIds.has(task.projectId)) &&
        taskMatchesQuery(
          { ...task, tagIds: task.tags.map((tt) => tt.tagId) },
          query,
          context,
          parents,
        ),
    );
    return sortForView(visible, query.view, (task) => task.settledAt).map((t) =>
      settledToCompletedAt(withRepeatRuleDto({ ...t, tags: t.tags.map((tt) => tt.tag) })),
    );
  }

  /**
   * 有效 Tag 的继承来源（ADR 0015）：用户全部 Project / Area 的自身 Tag，
   * 以及 Tag 树（ADR-0016）。
   */
  private async tagParents(userId: string): Promise<TagParents> {
    const tagIds = { select: { tagId: true } } as const;
    const [projects, areas, tags] = await Promise.all([
      this.prisma.project.findMany({
        where: { userId },
        select: { id: true, areaId: true, tags: tagIds },
      }),
      this.prisma.area.findMany({ where: { userId }, select: { id: true, tags: tagIds } }),
      this.prisma.tag.findMany({ where: { userId }, select: { id: true, parentId: true } }),
    ]);
    return tagParentsFrom(
      new Map(
        projects.map((p) => [p.id, { areaId: p.areaId, tagIds: p.tags.map((t) => t.tagId) }]),
      ),
      new Map(areas.map((a) => [a.id, { tagIds: a.tags.map((t) => t.tagId) }])),
      tags,
    );
  }

  /**
   * 任务搜索（Quick Find）：SQL 按标题 / 备注 / Subtask 标题粗筛，命中、
   * 范围与排序按 domain planTaskSearch（与设备同一规则）。
   */
  async search(userId: string, q: string, options?: TaskSearchOptions) {
    if (!hasSearchCriteria(q, options)) return [];
    const needle = q.trim();
    const contains = { contains: needle, mode: 'insensitive' as const };
    const tagIds = options?.tagIds ?? [];
    const parents = tagIds.length > 0 ? await this.tagParents(userId) : undefined;
    // 非立即模式下默认范围还有尚未移入 Logbook 的已了结任务（ADR 0022）
    const context = await calendarContextFor(this.prisma, userId);
    const listed = keepsSettledInViews(context) ? {} : { status: TaskStatus.ACTIVE };
    const tasks = await this.prisma.task.findMany({
      where: {
        userId,
        ...(options?.extended ? {} : { ...listed, trashedAt: null }),
        ...(needle
          ? {
              OR: [
                { title: contains },
                { notes: contains },
                { subtasks: { some: { title: contains } } },
              ],
            }
          : {}),
        // Tag 条件的粗筛：每个 Tag 的子树出现在自身、所属 Project / Area 的 Tag 里
        ...(parents
          ? {
              AND: tagIds.map((tagId) => {
                const hasTag = { some: { tagId: { in: [...parents.subtreeOf(tagId)] } } };
                return {
                  OR: [
                    { tags: hasTag },
                    { project: { tags: hasTag } },
                    { project: { area: { tags: hasTag } } },
                    { area: { tags: hasTag } },
                  ],
                };
              }),
            }
          : {}),
      },
      include: {
        ...WITH_TAGS,
        subtasks: {
          where: { title: contains },
          // 只有 Tag 条件时不需要 Subtask 命中
          ...(needle ? {} : { take: 0 }),
          select: { id: true, taskId: true, title: true, position: true },
        },
      },
    });
    const hits = planTaskSearch(
      tasks.map((task) => ({ ...task, tagIds: task.tags.map((tt) => tt.tagId) })),
      tasks.flatMap((task) => task.subtasks),
      q,
      options,
      parents,
      context,
    );
    return hits.map(({ task, matchedSubtasks, rank }) => ({
      // 这里的 subtasks 只是命中的那部分，不作为任务的子任务列表下发
      task: settledToCompletedAt(
        withRepeatRuleDto({ ...task, tags: task.tags.map((tt) => tt.tag), subtasks: undefined }),
      ),
      matchedSubtasks: matchedSubtasks.map(({ id, title }) => ({ id, title })),
      rank,
    }));
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        subtasks: true,
        attachments: true,
        tags: { include: { tag: true } },
      },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const { tags: taskTags, subtasks, attachments, ...rest } = task;
    return settledToCompletedAt({
      ...withRepeatRuleDto(rest),
      tags: taskTags.map((tt) => tt.tag),
      subtasks: sortByPosition(subtasks).map(settledToCompletedAt),
      attachments: sortByPosition(attachments),
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
    const { zones, review } = await userReviewSettings(this.prisma, userId);
    return this.hub.writeAsHub(userId, async (batch) => {
      const existing = await batch.tx.task.findFirst({
        where: { id, userId },
        include: { tags: true, subtasks: true, project: true },
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
        sortByPosition(existing.subtasks).map((subtask) => ({
          title: subtask.title,
          status: subtask.status,
          settledAt: subtask.settledAt?.toISOString() ?? null,
        })),
        zones,
        review,
      );

      // 新项目排在末尾
      const projectEdges = await edgePositions(batch.tx, 'Project', userId);
      const projectId = randomUUID();
      await batch.write('project', projectId, {
        ...toWireFields(plan.project),
        position: positionBetween(projectEdges.last, null),
      });

      // 提升出的任务插到最前，保持原 Subtask 的顺序（与设备 Engine 后端同一口径）
      const taskEdges = await edgePositions(batch.tx, 'Task', userId);
      const positions = positionsBetween(null, taskEdges.first, plan.promotedTasks.length);
      for (const [index, promoted] of plan.promotedTasks.entries()) {
        await batch.write('task', randomUUID(), {
          ...toWireFields({ ...promoted, projectId }),
          position: positions[index],
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
        subtasks: true,
        attachments: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const settledAt = new Date().toISOString();
    const plan = planTaskComplete(existing.status, settledAt);
    if (!plan) {
      // 已完成（双击 / 重试）：不改写了结时间，不二次派生
      const { tags, subtasks, attachments, ...row } = existing;
      void tags;
      void subtasks;
      void attachments;
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

  /**
   * 跳过本次（recurring-tasks-v2）：计划日期原地推进到链的下一个出现日、
   * 截止日同步平移、Subtask 全部置回未完成（规则见 domain planRepeatSkip）。
   * 不可跳过 → 409，message 为原因（RepeatSkipBlock）。
   */
  async skip(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
      include: { subtasks: { select: { id: true, status: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    const linked = await this.prisma.task.findFirst({
      where: { userId, repeatSourceId: id, trashedAt: null },
      select: { id: true },
    });
    const now = new Date().toISOString();
    const plan = planRepeatSkip(
      { ...existing, repeatRule: parseRepeatRule(existing.repeatRule) },
      linked !== null,
      now,
      await userCalendarZones(this.prisma, userId),
    );
    if ('blocked' in plan) throw new ConflictException(plan.blocked);
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('task', id, toWireFields(plan.patch));
      for (const subtask of existing.subtasks) {
        if (subtask.status === TaskStatus.ACTIVE) continue;
        await batch.write('subtask', subtask.id, subtaskStatusPatch(TaskStatus.ACTIVE, now));
      }
      return this.listDto(batch.tx, id);
    });
  }

  /**
   * 复制任务（Duplicate）：副本紧跟来源任务，内容照抄、状态为未完成，连同
   * Subtask 与附件（规则见 domain planTaskDuplicate）。
   */
  async duplicate(userId: string, id: string) {
    const source = await this.prisma.task.findFirst({
      where: { id, userId },
      include: { tags: true, subtasks: true, attachments: true },
    });
    if (!source) {
      throw new NotFoundException('Task not found');
    }
    const plan = planTaskDuplicate(
      {
        ...source,
        repeatRule: parseRepeatRule(source.repeatRule),
        tagIds: source.tags.map((tt) => tt.tagId),
      },
      source.subtasks,
      source.attachments,
      await userCalendarZones(this.prisma, userId),
    );
    const copyId = randomUUID();
    return this.hub.writeAsHub(userId, async (batch) => {
      const positions = await batch.tx.task.findMany({
        where: { userId },
        select: { id: true, position: true },
      });
      await batch.write('task', copyId, {
        ...toWireFields(plan.task),
        position: positionAfterRow(positions, id),
      });
      for (const { id: subtaskId, ...subtask } of plan.subtasksFor(copyId)) {
        await batch.write('subtask', subtaskId, subtask);
      }
      for (const { id: attachmentId, ...attachment } of plan.attachmentsFor(copyId)) {
        await batch.write('attachment', attachmentId, attachment);
      }
      return this.listDto(batch.tx, copyId);
    });
  }

  /** 重开（取消完成 / 取消取消）：已派生的实例独立存活，不随重开删除（recurring-tasks-v2）。 */
  private async reopen(userId: string, id: string) {
    await this.requireTask(this.prisma, userId, id);
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('task', id, toWireFields(taskReopenPatch()));
      return settledToCompletedAt(
        withRepeatRuleDto(await batch.tx.task.findUniqueOrThrow({ where: { id } })),
      );
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.task.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, position: true },
    });
    const ownedSet = new Set(owned.map((t) => t.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Task not found');
    }

    // 只给必须移动的行分配新 Position（与设备 Engine 后端同一口径）
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const { id, patch } of planReorder(owned, orderedIds)) {
        await batch.write('task', id, patch);
      }
    });
  }
}
