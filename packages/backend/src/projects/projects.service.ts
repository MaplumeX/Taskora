import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectBucket, ProjectStatus, ScheduledType, TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve bucket based on scheduledType (Project version — no parentId/projectId).
   * - DATE/SOMEDAY → SCHEDULED
   * - NONE → keep non-SCHEDULED bucket, or derive from area, or INBOX
   */
  private resolveBucket(
    bucket: ProjectBucket | undefined,
    scheduledType: ScheduledType | undefined,
    areaId: string | null | undefined,
  ): ProjectBucket {
    if (scheduledType === ScheduledType.DATE) return ProjectBucket.SCHEDULED;
    if (scheduledType === ScheduledType.SOMEDAY) return ProjectBucket.SCHEDULED;
    // scheduledType === NONE (or undefined → defaults to NONE)
    if (bucket && bucket !== ProjectBucket.SCHEDULED) return bucket;
    if (areaId) return ProjectBucket.ANYTIME;
    return ProjectBucket.INBOX;
  }

  async create(userId: string, dto: CreateProjectDto) {
    const max = await this.prisma.project.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const scheduledType = dto.scheduledType ?? ScheduledType.NONE;
    let scheduledDate: Date | null = null;
    if (scheduledType === ScheduledType.DATE && dto.scheduledDate) {
      scheduledDate = new Date(dto.scheduledDate);
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const bucket = this.resolveBucket(dto.bucket, scheduledType, dto.areaId);

    const created = await this.prisma.project.create({
      data: {
        title: dto.title,
        notes: dto.notes,
        areaId: dto.areaId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        userId,
        scheduledType,
        scheduledDate,
        dueDate,
        bucket,
        ...(dto.tagIds?.length
          ? { tags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: { tags: { include: { tag: true } } },
    });
    return {
      ...created,
      tags: created.tags.map((pt) => pt.tag),
      taskTotalCount: 0,
      taskCompletedCount: 0,
    };
  }

  async findAll(userId: string) {
    // 软删除（trashedAt != null）的项目不进入常规列表，仅在废纸篓 feed 中展示
    const projects = await this.prisma.project.findMany({
      where: { userId, trashedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { tags: { include: { tag: true } } },
    });

    const projectIds = projects.map((p) => p.id);

    // 两次 groupBy 避免 N+1：一次总数，一次 completed 数
    const [totalCounts, completedCounts] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: { userId, projectId: { in: projectIds }, trashedAt: null },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: {
          userId,
          projectId: { in: projectIds },
          trashedAt: null,
          status: TaskStatus.COMPLETED,
        },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, { total: number; completed: number }>();
    for (const row of totalCounts) {
      if (!row.projectId) continue;
      countMap.set(row.projectId, { total: row._count._all, completed: 0 });
    }
    for (const row of completedCounts) {
      if (!row.projectId) continue;
      const entry = countMap.get(row.projectId);
      if (entry) {
        entry.completed = row._count._all;
      } else {
        countMap.set(row.projectId, { total: 0, completed: row._count._all });
      }
    }

    return projects.map((p) => {
      const counts = countMap.get(p.id);
      return {
        ...p,
        tags: p.tags.map((pt) => pt.tag),
        taskTotalCount: counts?.total ?? 0,
        taskCompletedCount: counts?.completed ?? 0,
      };
    });
  }

  async findOne(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
      include: { tags: { include: { tag: true } } },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const [totalAgg, completedAgg] = await Promise.all([
      this.prisma.task.aggregate({
        where: { userId, projectId: id, trashedAt: null },
        _count: { _all: true },
      }),
      this.prisma.task.aggregate({
        where: {
          userId,
          projectId: id,
          trashedAt: null,
          status: TaskStatus.COMPLETED,
        },
        _count: { _all: true },
      }),
    ]);

    return {
      ...project,
      tags: project.tags.map((pt) => pt.tag),
      taskTotalCount: totalAgg._count._all,
      taskCompletedCount: completedAgg._count._all,
    };
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
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

    // Resolve bucket if scheduledType, scheduledDate, area, or bucket changed
    let bucket = existing.bucket;
    const newAreaId =
      dto.areaId !== undefined ? dto.areaId : existing.areaId;

    if (
      dto.scheduledType !== undefined ||
      dto.scheduledDate !== undefined ||
      dto.areaId !== undefined ||
      dto.bucket !== undefined
    ) {
      bucket = this.resolveBucket(
        (dto.bucket ?? existing.bucket) as ProjectBucket,
        newScheduledType as ScheduledType,
        newAreaId,
      );
    }

    const data: Prisma.ProjectUpdateInput = {};
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
    if (dto.areaId !== undefined) {
      data.area = dto.areaId
        ? { connect: { id: dto.areaId } }
        : { disconnect: true };
    }

    // 全量 set 语义：tagIds 传 undefined 不动；传数组则先删旧关联再建新关联
    if (dto.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.projectTag.deleteMany({ where: { projectId: id } }),
        ...(dto.tagIds.length > 0
          ? [
              this.prisma.projectTag.createMany({
                data: dto.tagIds.map((tagId) => ({ projectId: id, tagId })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data,
      include: { tags: { include: { tag: true } } },
    });

    const [totalAgg, completedAgg] = await Promise.all([
      this.prisma.task.aggregate({
        where: { userId, projectId: id, trashedAt: null },
        _count: { _all: true },
      }),
      this.prisma.task.aggregate({
        where: {
          userId,
          projectId: id,
          trashedAt: null,
          status: TaskStatus.COMPLETED,
        },
        _count: { _all: true },
      }),
    ]);

    return {
      ...updated,
      tags: updated.tags.map((pt) => pt.tag),
      taskTotalCount: totalAgg._count._all,
      taskCompletedCount: completedAgg._count._all,
    };
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { id, userId },
        data: { trashedAt: now },
      }),
      this.prisma.task.updateMany({
        where: { projectId: id, userId },
        data: { trashedAt: now },
      }),
    ]);

    return { id, trashedAt: now };
  }

  async restore(userId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { id, userId },
        data: { trashedAt: null },
      }),
      this.prisma.task.updateMany({
        where: { projectId: id, userId },
        data: { trashedAt: null },
      }),
    ]);

    return { id, trashedAt: null };
  }

  async complete(userId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async uncomplete(userId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.ACTIVE,
        completedAt: null,
      },
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.project.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Project not found');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.project.updateMany({
          where: { id, userId },
          data: { sortOrder: index },
        }),
      ),
    );
  }
}