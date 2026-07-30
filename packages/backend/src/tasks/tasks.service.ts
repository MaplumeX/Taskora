import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskBucket, TaskStatus, ScheduledType } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import { Prisma } from '@prisma/client';
import { buildTaskViewWhere } from './views';

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
    const bucket = this.resolveBucket(
      dto.bucket,
      scheduledType,
      dto.projectId,
      dto.areaId,
    );

    const created = await this.prisma.task.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        scheduledDate,
        scheduledType,
        dueDate,
        bucket,
        userId,
        parentId: dto.parentId,
        projectId: dto.projectId,
        areaId: dto.areaId,
        ...(dto.tagIds?.length
          ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: { tags: { include: { tag: true } } },
    });
    return { ...created, tags: created.tags.map((tt) => tt.tag) };
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
      if (query.parentId !== undefined) {
        where.parentId = query.parentId === '' ? null : query.parentId;
      }
      if (query.tagId) {
        where.tags = { some: { tagId: query.tagId } };
      }
      if (query.q) {
        // q mode: default ACTIVE, completed=true → [ACTIVE, COMPLETED]
        where.status = query.completed
          ? { in: [TaskStatus.ACTIVE, TaskStatus.COMPLETED] }
          : TaskStatus.ACTIVE;
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
        ? [{ completedAt: 'desc' as const }]
        : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }];

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy,
      include: { tags: { include: { tag: true } } },
    });
    return tasks.map((t) => ({ ...t, tags: t.tags.map((tt) => tt.tag) }));
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: { children: true, tags: { include: { tag: true } } },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const { tags: taskTags, ...rest } = task;
    return { ...rest, tags: taskTags.map((tt) => tt.tag) };
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
    const newProjectId =
      dto.projectId !== undefined ? dto.projectId : existing.projectId;
    const newAreaId =
      dto.areaId !== undefined ? dto.areaId : existing.areaId;

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
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }
    if (dto.projectId !== undefined) {
      data.project = dto.projectId
        ? { connect: { id: dto.projectId } }
        : { disconnect: true };
    }
    if (dto.areaId !== undefined) {
      data.area = dto.areaId
        ? { connect: { id: dto.areaId } }
        : { disconnect: true };
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
    return { ...updated, tags: updated.tags.map((tt) => tt.tag) };
  }

  async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw new NotFoundException('Task not found');
      }

      // Collect all descendant ids via BFS on parentId
      const allTasks = await tx.task.findMany({
        where: { userId },
        select: { id: true, parentId: true },
      });
      const childrenOf = new Map<string, string[]>();
      for (const t of allTasks) {
        if (t.parentId) {
          const arr = childrenOf.get(t.parentId) ?? [];
          arr.push(t.id);
          childrenOf.set(t.parentId, arr);
        }
      }
      const descendantIds = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const layer = queue.splice(0);
        for (const parentId of layer) {
          const kids = childrenOf.get(parentId);
          if (!kids) continue;
          for (const kid of kids) {
            if (!descendantIds.has(kid)) {
              descendantIds.add(kid);
              queue.push(kid);
            }
          }
        }
      }

      const allIds = [id, ...descendantIds];
      const now = new Date();
      await tx.task.updateMany({
        where: { id: { in: allIds }, userId },
        data: { trashedAt: now },
      });

      return { id, trashedAt: now };
    });
  }

  async restore(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw new NotFoundException('Task not found');
      }

      // Collect all descendant ids via BFS on parentId
      const allTasks = await tx.task.findMany({
        where: { userId },
        select: { id: true, parentId: true },
      });
      const childrenOf = new Map<string, string[]>();
      for (const t of allTasks) {
        if (t.parentId) {
          const arr = childrenOf.get(t.parentId) ?? [];
          arr.push(t.id);
          childrenOf.set(t.parentId, arr);
        }
      }
      const descendantIds = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const layer = queue.splice(0);
        for (const parentId of layer) {
          const kids = childrenOf.get(parentId);
          if (!kids) continue;
          for (const kid of kids) {
            if (!descendantIds.has(kid)) {
              descendantIds.add(kid);
              queue.push(kid);
            }
          }
        }
      }

      const allIds = [id, ...descendantIds];
      await tx.task.updateMany({
        where: { id: { in: allIds }, userId },
        data: { trashedAt: null },
      });

      return { id, trashedAt: null };
    });
  }

  async complete(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async uncomplete(userId: string, id: string) {
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.ACTIVE,
        completedAt: null,
      },
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.task.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((t) => t.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.task.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}