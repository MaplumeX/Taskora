import { randomUUID } from 'node:crypto';
import { calendarDateStorage } from '@taskora/shared';
import { userCalendarZones, matchesCalendarView } from '../users/account-time-zone';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TaskBucket,
  ProjectBucket,
  TaskStatus,
  ProjectStatus,
  ScheduledType,
} from '@taskora/shared';
import {
  canonicalRepeatRule,
  deriveRepeatInstanceId,
  deriveSubtaskId,
  nextOccurrenceDate,
  normalizeRepeatRule,
} from '@taskora/engine';
import { PrismaService } from '../prisma/prisma.service';
import { registerCompacted } from '../sync/compact-registry';
import { synthPosition } from '../sync/entity-codec';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import { Prisma } from '@prisma/client';
import { buildTaskViewWhere, WITH_SETTLED_STATUSES } from './views';
import { parseRepeatRule, settledToCompletedAt, withRepeatRuleDto } from './task-dto.mapper';

/** 派生路径需要的 Task 行形状（含标签关系与子任务）。 */
type TaskRowWithChildren = Prisma.TaskGetPayload<{
  include: { tags: true; subtasks: { orderBy: { sortOrder: 'asc' } } };
}>;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Repeat Instance 服务端派生（recurring-tasks spec / ADR-0012）：REST
   * 客户端（web）无法本地派生，完成路径由服务端代为派生 —— 与设备侧
   * 派生共用 @taskora/engine 纯函数，产出同一确定性 id；设备侧派生的
   * 同一实例经 hub 字段级 LWW 自然收敛。幂等：目标 id 已存在则跳过。
   */
  private async deriveRepeatInstance(
    userId: string,
    parent: TaskRowWithChildren,
    settledAt: Date,
  ): Promise<void> {
    const rule = parseRepeatRule(parent.repeatRule);
    if (!rule) return;
    const occurrence = nextOccurrenceDate(rule, {
      scheduledDate: parent.scheduledDate ? parent.scheduledDate.toISOString() : null,
      settledAt: settledAt.toISOString(),
      ...(await userCalendarZones(this.prisma, userId)),
    });
    if (occurrence === null) return; // 到达 until / 无锚：链终结

    const deterministicId = deriveRepeatInstanceId(parent.id, rule, occurrence);
    const existing = await this.prisma.task.findFirst({
      where: { id: deterministicId, userId },
      select: { id: true },
    });
    if (existing) return; // 幂等（restore 后重完成 / 并发派生）
    // 确定性 id 已被 compact（un-complete 删除过该实例后重新完成）：该 id
    // 无法在设备副本上复活（ADR-0008 Compact 永久获胜——设备的 compact 集
    // 会丢弃增量拉取），回退到新生成 id（ADR-0008 认可的复活路径）。
    const compacted = await this.prisma.compactedEntity.findFirst({
      where: { userId, entity: 'task', entityId: deterministicId },
      select: { entityId: true },
    });
    const instanceId = compacted ? randomUUID() : deterministicId;

    const maxSort = await this.prisma.task.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    // 派生实例进入列表末尾（新位次，不继承父任务位次）；标签随实例延续
    await this.prisma.task.create({
      data: {
        id: instanceId,
        title: parent.title,
        notes: parent.notes,
        scheduledDate: new Date(`${occurrence}T00:00:00.000Z`),
        scheduledType: ScheduledType.DATE,
        reminderTime: parent.reminderTime,
        repeatRule: canonicalRepeatRule(rule),
        bucket: TaskBucket.SCHEDULED,
        status: TaskStatus.ACTIVE,
        userId,
        projectId: parent.projectId,
        headingId: parent.headingId,
        areaId: parent.areaId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
        ...(parent.tags.length > 0
          ? { tags: { create: parent.tags.map((tt) => ({ tagId: tt.tagId })) } }
          : {}),
      },
    });
    // Subtask 复制为派生实体（确定性 id）并重置 ACTIVE
    for (const [index, subtask] of parent.subtasks.entries()) {
      await this.prisma.subtask.create({
        data: {
          id: deriveSubtaskId(instanceId, index),
          title: subtask.title,
          taskId: instanceId,
          sortOrder: index,
          status: TaskStatus.ACTIVE,
        },
      });
    }
  }

  /**
   * 取消派生副作用（ADR-0012）：重开（un-complete / un-cancel）删除其
   * 派生实例 —— Compact 登记 + 物理删除（Subtask 由 DB 级联），与
   * convertToProject 的删除惯例一致。不存在则无操作（纯取消从未派生）。
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
    const rule = parseRepeatRule(parent.repeatRule);
    if (!rule) return;
    const occurrence = nextOccurrenceDate(rule, {
      scheduledDate: parent.scheduledDate ? parent.scheduledDate.toISOString() : null,
      settledAt: parent.settledAt ? parent.settledAt.toISOString() : null,
      ...(await userCalendarZones(this.prisma, userId)),
    });
    if (occurrence === null) return;
    const instanceId = deriveRepeatInstanceId(parent.id, rule, occurrence);
    await this.prisma.$transaction(async (tx) => {
      const instance = await tx.task.findFirst({
        where: { id: instanceId, userId },
        include: { subtasks: { select: { id: true } } },
      });
      if (!instance) return;
      await registerCompacted(tx, userId, 'task', [instanceId]);
      await registerCompacted(
        tx,
        userId,
        'subtask',
        instance.subtasks.map((s) => s.id),
      );
      await tx.task.delete({ where: { id: instanceId } });
    });
  }

  /**
   * Resolve bucket based on scheduledType, following design.md.
   * - DATE/SOMEDAY → SCHEDULED
   * - NONE → keep non-SCHEDULED bucket, or derive from project/area, or INBOX
   */
  private resolveBucket(
    bucket: TaskBucket | undefined,
    scheduledType: ScheduledType | undefined,
    projectId: string | null | undefined,
    areaId: string | null | undefined,
  ): TaskBucket {
    if (scheduledType === ScheduledType.DATE) return TaskBucket.SCHEDULED;
    if (scheduledType === ScheduledType.SOMEDAY) return TaskBucket.SCHEDULED;
    // scheduledType === NONE (or undefined → defaults to NONE)
    if (bucket && bucket !== TaskBucket.SCHEDULED) return bucket;
    if (projectId || areaId) return TaskBucket.ANYTIME;
    return TaskBucket.INBOX;
  }

  async create(userId: string, dto: CreateTaskDto) {
    const zone = (await userCalendarZones(this.prisma, userId)).legacyDateTimeZone;
    const scheduledType = dto.scheduledType ?? ScheduledType.NONE;
    // Determine scheduledDate based on scheduledType
    let scheduledDate: Date | null = null;
    if (scheduledType === ScheduledType.DATE && dto.scheduledDate) {
      scheduledDate = calendarDateStorage(dto.scheduledDate, zone);
    }
    const dueDate = dto.dueDate ? calendarDateStorage(dto.dueDate, zone) : null;
    const bucket = this.resolveBucket(dto.bucket, scheduledType, dto.projectId, dto.areaId);

    const created = await this.prisma.task.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        scheduledDate,
        scheduledType,
        dueDate,
        bucket,
        userId,
        projectId: dto.projectId,
        areaId: dto.areaId,
        ...(dto.tagIds?.length ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } } : {}),
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
    const zones =
      query.view === 'today' || query.view === 'upcoming'
        ? await userCalendarZones(this.prisma, userId)
        : { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };
    const now = new Date();
    return tasks
      .filter((task) =>
        matchesCalendarView(
          task.scheduledDate,
          query.view ?? '',
          zones.timeZone,
          now,
          zones.legacyDateTimeZone,
        ),
      )
      .map((t) =>
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
    const zone = (await userCalendarZones(this.prisma, userId)).legacyDateTimeZone;
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // Determine effective scheduledType and scheduledDate
    const newScheduledType =
      dto.scheduledType !== undefined ? dto.scheduledType : existing.scheduledType;

    let effectiveScheduledDate: Date | null;
    if (newScheduledType === ScheduledType.SOMEDAY) {
      effectiveScheduledDate = null;
    } else if (newScheduledType === ScheduledType.NONE) {
      effectiveScheduledDate = null;
    } else {
      // DATE
      if (dto.scheduledDate !== undefined) {
        effectiveScheduledDate = dto.scheduledDate
          ? calendarDateStorage(dto.scheduledDate, zone)
          : null;
      } else {
        effectiveScheduledDate = existing.scheduledDate;
      }
    }

    // Resolve bucket if scheduledType, scheduledDate, project/area, or bucket changed
    let bucket = existing.bucket;
    const newProjectId = dto.projectId !== undefined ? dto.projectId : existing.projectId;
    const newAreaId = dto.areaId !== undefined ? dto.areaId : existing.areaId;

    if (
      dto.scheduledType !== undefined ||
      dto.scheduledDate !== undefined ||
      dto.projectId !== undefined ||
      dto.areaId !== undefined ||
      dto.bucket !== undefined
    ) {
      bucket = this.resolveBucket(
        (dto.bucket ?? existing.bucket) as TaskBucket,
        newScheduledType as ScheduledType,
        newProjectId,
        newAreaId,
      );
    }

    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.scheduledType !== undefined || dto.scheduledDate !== undefined) {
      data.scheduledDate = effectiveScheduledDate;
    }
    if (dto.scheduledType !== undefined) {
      data.scheduledType = newScheduledType;
    }
    // Reminder 清理规则（reminders spec）：ScheduledType 离开 DATE 时
    // 一律清除提醒，防止残留提醒在 Someday/NONE 任务上到期触发；
    // 换日期（DATE → DATE）保留 reminderTime 不变。
    if (newScheduledType !== ScheduledType.DATE) {
      data.reminderTime = null;
    } else if (dto.reminderTime !== undefined) {
      data.reminderTime = dto.reminderTime;
    }
    // Repeat Rule 清理规则（recurring-tasks spec）：离开 DATE 一律清除
    // 规则（规则无锚即无意义，镜像 Reminder 清理语义）；换日期保留。
    // 写入前归一化为规范形（派生 id 依赖稳定输入，ADR-0012）；非法对象
    // 忽略（校验层已挡形状，此处防御纵深）。
    if (newScheduledType !== ScheduledType.DATE) {
      data.repeatRule = null;
    } else if (dto.repeatRule !== undefined) {
      const normalized = normalizeRepeatRule(dto.repeatRule);
      if (dto.repeatRule === null || normalized !== null) {
        data.repeatRule = normalized === null ? null : canonicalRepeatRule(normalized);
      }
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? calendarDateStorage(dto.dueDate, zone) : null;
    }
    data.bucket = bucket;
    if (dto.projectId !== undefined) {
      data.project = dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true };
    }
    if (dto.projectId !== undefined && dto.projectId !== existing.projectId) {
      data.heading = { disconnect: true };
    }
    if (dto.areaId !== undefined) {
      data.area = dto.areaId ? { connect: { id: dto.areaId } } : { disconnect: true };
    }

    // 全量 set 语义：tagIds 传 undefined 不动；传数组则先删旧关联再建新关联
    if (dto.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.taskTag.deleteMany({ where: { taskId: id } }),
        ...(dto.tagIds.length > 0
          ? [
              this.prisma.taskTag.createMany({
                data: dto.tagIds.map((tagId) => ({ taskId: id, tagId })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
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
      // 移入 Trash 清除提醒（reminders spec）：被丢弃的工作不再通知。
      data: { trashedAt: now, reminderTime: null },
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
      // "从垃圾桶捡回"语义始终是"未了结"（spec: task-cancelled story 19）：
      // 恢复一律回 ACTIVE 并清空了结时间，与终态正交。
      data: { trashedAt: null, status: TaskStatus.ACTIVE, settledAt: null },
    });

    return { id, trashedAt: null };
  }

  async convertToProject(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Step 1: find the task with tags, subtasks, and its parent project (for areaId fallback)
      const existing = await tx.task.findFirst({
        where: { id, userId },
        include: { tags: true, subtasks: { orderBy: { sortOrder: 'asc' } }, project: true },
      });
      if (!existing) {
        throw new NotFoundException('Task not found');
      }
      const effectiveAreaId = existing.areaId ?? existing.project?.areaId ?? null;

      // Step 2: compute next sortOrder for the new project
      const maxSort = await tx.project.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      // Step 3: create the new project from the task's fields
      const newProject = await tx.project.create({
        data: {
          title: existing.title,
          notes: existing.notes,
          scheduledDate: existing.scheduledDate,
          dueDate: existing.dueDate,
          scheduledType: existing.scheduledType,
          status:
            existing.status === TaskStatus.COMPLETED
              ? ProjectStatus.COMPLETED
              : ProjectStatus.ACTIVE,
          // Project 无 CANCELLED 终态（out of scope）：仅完成任务携带了结时间。
          completedAt: existing.status === TaskStatus.COMPLETED ? existing.settledAt : null,
          trashedAt: existing.trashedAt,
          areaId: effectiveAreaId,
          bucket: existing.bucket as ProjectBucket,
          sortOrder: nextSortOrder,
          userId,
          tags: {
            create: existing.tags.map((tt) => ({ tagId: tt.tagId })),
          },
        },
        include: { tags: { include: { tag: true } } },
      });

      // Step 4: promote subtasks to full Tasks under the new project.
      // Per-row creates (not createMany) so the Change Event interceptor
      // can emit a created event per task — createMany returns no ids.
      for (const st of existing.subtasks) {
        await tx.task.create({
          data: {
            title: st.title,
            status: st.status,
            settledAt: st.settledAt,
            projectId: newProject.id,
            userId,
            bucket: TaskBucket.INBOX,
            scheduledType: ScheduledType.NONE,
          },
        });
      }

      // Step 5: Compact 登记与原 Task/Subtask 的物理删除同事务提交。
      await registerCompacted(tx, userId, 'task', [id]);
      await registerCompacted(
        tx,
        userId,
        'subtask',
        existing.subtasks.map((subtask) => subtask.id),
      );
      // Subtask + TaskTag 由数据库级联删除。
      await tx.task.delete({ where: { id } });

      // Step 6: return the new project with resolved tags
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
        // 派生序号的排序口径与设备副本一致（sortOrder ASC, createdAt DESC
        // tie-break），否则平局顺序两端漂移 → 派生出不同的子任务 id。
        subtasks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 终态可直接改写（ADR 0006）：COMPLETED ↔ CANCELLED 切换时刷新 settledAt。
    // 了结清除提醒（reminders spec）：已完成/取消的工作不再通知。
    const settledAt = new Date();
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        settledAt,
        reminderTime: null,
      },
    });
    // 重复任务：完成后立刻派生下一实例（结算副作用；取消不派生）。
    // 提醒等复制源以结算前状态（existing）为准。已 COMPLETED 的重复完成
    // （双击/重试）不二次派生：anchor=completion 下刷新 settledAt 会算出
    // 不同 occurrence，产生第二个实例（与设备侧 completeTask 的早退守卫
    // 同口径）。
    if (existing.status !== TaskStatus.COMPLETED) {
      await this.deriveRepeatInstance(userId, existing, settledAt);
    }
    return settledToCompletedAt(withRepeatRuleDto(updated));
  }

  async uncomplete(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 重开取消派生副作用：删除其派生实例（ADR-0012）
    await this.deleteDerivedInstance(userId, existing);
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    return settledToCompletedAt(withRepeatRuleDto(updated));
  }

  async cancel(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 取消父 Task 不改动其 Subtasks（与 complete 行为一致，见 CONTEXT.md）。
    // 了结清除提醒（reminders spec）：已完成/取消的工作不再通知。
    // 取消不派生 Repeat Instance：链就此终结，规则保留作 Logbook 溯源。
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.CANCELLED,
        settledAt: new Date(),
        reminderTime: null,
      },
    });
    return settledToCompletedAt(withRepeatRuleDto(updated));
  }

  async uncancel(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 重开同样取消派生副作用（完成→取消→重开路径下删除仍存活的实例）
    await this.deleteDerivedInstance(userId, existing);
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
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
