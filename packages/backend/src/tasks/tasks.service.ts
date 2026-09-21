import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TaskBucket,
  ProjectBucket,
  TaskStatus,
  ProjectStatus,
  ScheduledType,
} from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { registerCompacted } from '../sync/compact-registry';
import { synthPosition } from '../sync/entity-codec';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import { Prisma } from '@prisma/client';
import { buildTaskViewWhere, WITH_SETTLED_STATUSES } from './views';
import { settledToCompletedAt } from './task-dto.mapper';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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
    const scheduledType = dto.scheduledType ?? ScheduledType.NONE;
    // Determine scheduledDate based on scheduledType
    let scheduledDate: Date | null = null;
    if (scheduledType === ScheduledType.DATE && dto.scheduledDate) {
      scheduledDate = new Date(dto.scheduledDate);
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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
    return settledToCompletedAt({
      ...created,
      tags: created.tags.map((tt) => tt.tag),
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

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy,
      include: { tags: { include: { tag: true } } },
    });
    return tasks.map((t) => settledToCompletedAt({ ...t, tags: t.tags.map((tt) => tt.tag) }));
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
      ...rest,
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
        effectiveScheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
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
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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
    return settledToCompletedAt({
      ...updated,
      tags: updated.tags.map((tt) => tt.tag),
    });
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
      data: { trashedAt: now },
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
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 终态可直接改写（ADR 0006）：COMPLETED ↔ CANCELLED 切换时刷新 settledAt。
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        settledAt: new Date(),
      },
    });
    return settledToCompletedAt(updated);
  }

  async uncomplete(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    return settledToCompletedAt(updated);
  }

  async cancel(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // 取消父 Task 不改动其 Subtasks（与 complete 行为一致，见 CONTEXT.md）。
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.CANCELLED,
        settledAt: new Date(),
      },
    });
    return settledToCompletedAt(updated);
  }

  async uncancel(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        settledAt: null,
      },
    });
    return settledToCompletedAt(updated);
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
