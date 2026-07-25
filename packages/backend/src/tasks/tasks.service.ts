import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskBucket, TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, TaskQueryDto } from './dto/tasks.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve bucket based on inputs, following design.md §2.3.
   * Note: only scheduledDate drives SCHEDULED bucket, never dueDate.
   */
  private resolveBucket(
    bucket: TaskBucket | undefined,
    scheduledDate: string | null | undefined,
    projectId: string | null | undefined,
    areaId: string | null | undefined,
  ): TaskBucket {
    if (scheduledDate) return TaskBucket.SCHEDULED;
    if (bucket) return bucket;
    if (projectId || areaId) return TaskBucket.ANYTIME;
    return TaskBucket.INBOX;
  }

  async create(userId: string, dto: CreateTaskDto) {
    const scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const bucket = this.resolveBucket(
      dto.bucket,
      dto.scheduledDate,
      dto.projectId,
      dto.areaId,
    );

    return this.prisma.task.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        scheduledDate,
        dueDate,
        bucket,
        userId,
        parentId: dto.parentId,
        projectId: dto.projectId,
        areaId: dto.areaId,
      },
    });
  }

  async findAll(userId: string, query: TaskQueryDto) {
    const where: Prisma.TaskWhereInput = { userId };

    if (query.view) {
      switch (query.view) {
        case 'inbox':
          where.bucket = TaskBucket.INBOX;
          where.status = TaskStatus.ACTIVE;
          where.scheduledDate = null;
          break;
        case 'today': {
          where.status = TaskStatus.ACTIVE;
          where.scheduledDate = { lte: new Date() };
          break;
        }
        case 'upcoming': {
          where.status = TaskStatus.ACTIVE;
          where.scheduledDate = { gt: new Date() };
          break;
        }
        case 'anytime':
          where.bucket = TaskBucket.ANYTIME;
          where.status = TaskStatus.ACTIVE;
          where.scheduledDate = null;
          break;
        case 'someday':
          where.bucket = TaskBucket.SOMEDAY;
          where.status = TaskStatus.ACTIVE;
          where.scheduledDate = null;
          break;
        case 'trash':
          where.status = TaskStatus.TRASHED;
          break;
        case 'logbook':
          where.status = TaskStatus.COMPLETED;
          break;
      }
    } else {
      if (query.projectId) where.projectId = query.projectId;
      if (query.areaId) where.areaId = query.areaId;
      if (query.parentId !== undefined) {
        where.parentId = query.parentId === '' ? null : query.parentId;
      }
      if (query.tagId) {
        where.tags = { some: { tagId: query.tagId } };
      }
      if (!query.completed) {
        where.status = TaskStatus.ACTIVE;
      }
      if (query.completed) {
        // include both active and completed when explicitly requested
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

    // Resolve bucket if scheduledDate or project/area changed
    let bucket = existing.bucket;
    const newScheduledDate =
      dto.scheduledDate !== undefined
        ? dto.scheduledDate
          ? new Date(dto.scheduledDate).toISOString()
          : null
        : existing.scheduledDate?.toISOString() ?? null;
    const newProjectId =
      dto.projectId !== undefined ? dto.projectId : existing.projectId;
    const newAreaId =
      dto.areaId !== undefined ? dto.areaId : existing.areaId;

    if (dto.scheduledDate !== undefined || dto.projectId !== undefined || dto.areaId !== undefined || dto.bucket !== undefined) {
      bucket = this.resolveBucket(
        dto.bucket ?? (newScheduledDate ? TaskBucket.SCHEDULED : undefined),
        newScheduledDate,
        newProjectId,
        newAreaId,
      );
    }

    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.scheduledDate !== undefined) {
      data.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
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
    const existing = await this.prisma.task.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.TRASHED,
        trashedAt: new Date(),
      },
    });
  }

  async restore(userId: string, id: string) {
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
        trashedAt: null,
      },
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
}