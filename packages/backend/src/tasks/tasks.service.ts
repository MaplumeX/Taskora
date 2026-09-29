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
import { registerCompacted } from '../sync/compact-registry';
import { synthPosition } from '../sync/entity-codec';
import { calendarContextFor, toPrismaData } from '../common/domain-storage';
import { userCalendarZones } from '../users/account-time-zone';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import { buildTaskViewWhere, WITH_SETTLED_STATUSES } from './views';
import { parseRepeatRule, settledToCompletedAt, withRepeatRuleDto } from './task-dto.mapper';

/** 派生路径需要的 Task 行形状（含标签关系与子任务）。 */
type TaskRowWithChildren = Prisma.TaskGetPayload<{
  include: { tags: true; subtasks: { orderBy: { sortOrder: 'asc' } } };
}>;

/**
 * 任务的 REST 写路径（web 与 Agent）。领域规则（bucket、计划、生命周期、
 * 重复派生、转项目、列表过滤）来自 @taskora/engine 的 domain 纯函数，与
 * 设备的 Engine 后端共用（local-first-v3 issue 04）；这里只负责读 Postgres、
 * 调规则、换成存储形态写回。
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Repeat Instance 服务端派生（ADR-0012）：web 无法本地派生，完成路径由
   * 服务端代为派生（规则见 domain planRepeatInstance），与设备派生产出
   * 同一确定性 id，经 hub 字段级 LWW 自然收敛。parent 取结算前的状态。
   */
  private async deriveRepeatInstance(
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
    const existing = await this.prisma.task.findFirst({
      where: { id: plan.id, userId },
      select: { id: true },
    });
    if (existing) return; // 幂等（restore 后重完成 / 并发派生）
    // 确定性 id 已被 compact（重开删除过该实例后重新完成）：设备副本上
    // 无法复活（ADR-0008 Compact 永久获胜），换新 id——唯一的复活路径。
    const compacted = await this.prisma.compactedEntity.findFirst({
      where: { userId, entity: 'task', entityId: plan.id },
      select: { entityId: true },
    });
    const instanceId = compacted ? randomUUID() : plan.id;

    const maxSort = await this.prisma.task.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    // 派生实例进入列表末尾（新位次，不继承父任务位次）
    await this.prisma.task.create({
      data: {
        ...(toPrismaData(plan.task) as Prisma.TaskUncheckedCreateInput),
        id: instanceId,
        userId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        ...(plan.task.tagIds.length > 0
          ? { tags: { create: plan.task.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
    });
    for (const subtask of plan.subtasksFor(instanceId)) {
      await this.prisma.subtask.create({
        data: toPrismaData(subtask) as Prisma.SubtaskUncheckedCreateInput,
      });
    }
  }

  /**
   * 取消派生副作用（ADR-0012）：重开删除其派生实例——Compact 登记 +
   * 物理删除（Subtask 由 DB 级联）。不存在则无操作（纯取消从未派生）。
   */
  private async deleteDerivedInstance(
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
    if (!target) return;
    await this.prisma.$transaction(async (tx) => {
      const instance = await tx.task.findFirst({
        where: { id: target.id, userId },
        include: { subtasks: { select: { id: true } } },
      });
      if (!instance) return;
      await registerCompacted(tx, userId, 'task', [target.id]);
      await registerCompacted(
        tx,
        userId,
        'subtask',
        instance.subtasks.map((s) => s.id),
      );
      await tx.task.delete({ where: { id: target.id } });
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    const fields = planTaskCreate(dto, await userCalendarZones(this.prisma, userId));
    const created = await this.prisma.task.create({
      data: {
        ...(toPrismaData(fields) as Prisma.TaskUncheckedCreateInput),
        userId,
        ...(fields.tagIds.length
          ? { tags: { create: fields.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: { tags: { include: { tag: true } } },
    });
    return settledToCompletedAt(
      withRepeatRuleDto({ ...created, tags: created.tags.map((tt) => tt.tag) }),
    );
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

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy,
      include: { tags: { include: { tag: true } } },
    });
    // SQL 只是粗筛；最终过滤按 domain taskMatchesQuery（与设备同一规则）
    const context = await calendarContextFor(this.prisma, userId, viewNeedsCalendar(query.view));
    const visible = tasks.filter((task) =>
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
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    const patch = planTaskUpdate(existing, dto, await userCalendarZones(this.prisma, userId));

    // 全量 set 语义：tagIds 传 undefined 不动；传数组则先删旧关联再建新关联
    if (patch.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.taskTag.deleteMany({ where: { taskId: id } }),
        ...(patch.tagIds.length > 0
          ? [
              this.prisma.taskTag.createMany({
                data: patch.tagIds.map((tagId) => ({ taskId: id, tagId })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: toPrismaData(patch) as Prisma.TaskUncheckedUpdateInput,
      include: { tags: { include: { tag: true } } },
    });
    return settledToCompletedAt(
      withRepeatRuleDto({ ...updated, tags: updated.tags.map((tt) => tt.tag) }),
    );
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const now = new Date();
    await this.prisma.task.updateMany({
      where: { id, userId },
      data: toPrismaData(taskTrashPatch(now.toISOString())),
    });

    return { id, trashedAt: now };
  }

  async restore(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.task.updateMany({
      where: { id, userId },
      data: toPrismaData(taskRestorePatch()),
    });

    return { id, trashedAt: null };
  }

  async convertToProject(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, userId },
        include: { tags: true, subtasks: { orderBy: { sortOrder: 'asc' } }, project: true },
      });
      if (!existing) {
        throw new NotFoundException('Task not found');
      }
      const zones = await userCalendarZones(this.prisma, userId);
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
      const maxSort = await tx.project.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const newProject = await tx.project.create({
        data: {
          ...(toPrismaData(plan.project) as Prisma.ProjectUncheckedCreateInput),
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          userId,
          tags: { create: plan.project.tagIds.map((tagId) => ({ tagId })) },
        },
        include: { tags: { include: { tag: true } } },
      });

      // 提升出的任务逐条 create（collector 按行发 Change Event；createMany 不返回 id）
      for (const promoted of plan.promotedTasks) {
        await tx.task.create({
          data: {
            ...(toPrismaData({
              ...promoted,
              projectId: newProject.id,
            }) as Prisma.TaskUncheckedCreateInput),
            userId,
          },
        });
      }

      // Compact 登记与原 Task/Subtask 的物理删除同事务提交（Subtask + TaskTag 由 DB 级联）
      await registerCompacted(tx, userId, 'task', [id]);
      await registerCompacted(
        tx,
        userId,
        'subtask',
        existing.subtasks.map((subtask) => subtask.id),
      );
      await tx.task.delete({ where: { id } });

      return {
        ...newProject,
        tags: newProject.tags.map((pt) => pt.tag),
      };
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
    const updated = await this.prisma.task.update({
      where: { id },
      data: toPrismaData(plan.patch),
    });
    if (plan.deriveRepeat) await this.deriveRepeatInstance(userId, existing, settledAt);
    return settledToCompletedAt(withRepeatRuleDto(updated));
  }

  async uncomplete(userId: string, id: string) {
    return this.reopen(userId, id);
  }

  async cancel(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    // 取消父 Task 不改动其 Subtasks（CONTEXT.md）；不派生，链就此终结
    const updated = await this.prisma.task.update({
      where: { id },
      data: toPrismaData(taskCancelPatch(new Date().toISOString())),
    });
    return settledToCompletedAt(withRepeatRuleDto(updated));
  }

  async uncancel(userId: string, id: string) {
    return this.reopen(userId, id);
  }

  /** 重开（取消完成 / 取消取消）：先删除已派生的实例（ADR-0012）。 */
  private async reopen(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    await this.deleteDerivedInstance(userId, existing);
    const updated = await this.prisma.task.update({
      where: { id },
      data: toPrismaData(taskReopenPatch()),
    });
    return settledToCompletedAt(withRepeatRuleDto(updated));
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

    // 双排序键一起写：sortOrder 是 web 端 REST 读序列，position 是
    // 桌面端 Local Replica 读序列（fractional indexing）。漏写 position
    // 时，已被设备写过真实 position 的行在桌面端不会再变序（hub 对
    // position null 的 legacy 行才按 sortOrder 合成）。写入值与 hub
    // 的合成函数完全一致，两端排序口径不漂移。
    const createdAtOf = new Map(owned.map((t) => [t.id, t.createdAt]));
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.task.updateMany({
          where: { id, userId },
          data: {
            sortOrder: index,
            position: synthPosition(index, createdAtOf.get(id)!),
          },
        }),
      ),
    );
  }
}
