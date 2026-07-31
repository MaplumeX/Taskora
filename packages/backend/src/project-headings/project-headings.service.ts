import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@taskora/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectHeadingDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from './dto/project-headings.dto';

@Injectable()
export class ProjectHeadingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProjectOwnership(
    userId: string,
    projectId: string,
    tx: Pick<PrismaService, 'project'> = this.prisma,
  ) {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId, trashedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async findAll(userId: string, projectId: string) {
    await this.assertProjectOwnership(userId, projectId);
    return this.prisma.projectHeading.findMany({
      where: { userId, projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateProjectHeadingDto) {
    await this.assertProjectOwnership(userId, dto.projectId);
    const max = await this.prisma.projectHeading.aggregate({
      where: { userId, projectId: dto.projectId },
      _max: { sortOrder: true },
    });
    return this.prisma.projectHeading.create({
      data: {
        userId,
        projectId: dto.projectId,
        title: dto.title,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateProjectHeadingDto) {
    return this.prisma.$transaction(async (tx) => {
      const heading = await tx.projectHeading.findFirst({
        where: { id, userId },
        select: { id: true, projectId: true },
      });
      if (!heading) {
        throw new NotFoundException('Heading not found');
      }
      await this.assertProjectOwnership(userId, heading.projectId, tx);
      const updated = await tx.projectHeading.updateMany({
        where: { id, userId, projectId: heading.projectId },
        data: dto.title === undefined ? {} : { title: dto.title },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Heading changed; refresh and retry');
      }
      return tx.projectHeading.findFirst({
        where: { id, userId, projectId: heading.projectId },
      });
    });
  }

  async reorder(userId: string, dto: ReorderProjectHeadingLayoutDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectOwnership(userId, dto.projectId, tx);

      const [headings, visibleTasks] = await Promise.all([
        tx.projectHeading.findMany({
          where: { userId, projectId: dto.projectId },
          select: { id: true },
        }),
        tx.task.findMany({
          where: {
            userId,
            projectId: dto.projectId,
            parentId: null,
            trashedAt: null,
            status: TaskStatus.ACTIVE,
          },
          select: { id: true },
        }),
      ]);

      const headingIds = dto.groups.map((group) => group.headingId);
      this.assertExactIdSet(
        headingIds,
        headings.map((heading) => heading.id),
        'heading',
      );

      const submittedTaskIds = [
        ...dto.ungroupedTaskIds,
        ...dto.groups.flatMap((group) => group.taskIds),
      ];
      this.assertExactIdSet(
        submittedTaskIds,
        visibleTasks.map((task) => task.id),
        'task',
      );

      const writes = await Promise.all([
        ...dto.groups.map((group, sortOrder) =>
          tx.projectHeading.updateMany({
            where: {
              id: group.headingId,
              userId,
              projectId: dto.projectId,
            },
            data: { sortOrder },
          }),
        ),
        ...dto.ungroupedTaskIds.map((id, sortOrder) =>
          tx.task.updateMany({
            where: {
              id,
              userId,
              projectId: dto.projectId,
              parentId: null,
              trashedAt: null,
              status: TaskStatus.ACTIVE,
            },
            data: { headingId: null, sortOrder },
          }),
        ),
        ...dto.groups.flatMap((group) =>
          group.taskIds.map((id, sortOrder) =>
            tx.task.updateMany({
              where: {
                id,
                userId,
                projectId: dto.projectId,
                parentId: null,
                trashedAt: null,
                status: TaskStatus.ACTIVE,
              },
              data: { headingId: group.headingId, sortOrder },
            }),
          ),
        ),
      ]);
      if (writes.some((write) => write.count !== 1)) {
        throw new BadRequestException('Layout changed; refresh and retry');
      }
    });
  }

  private assertExactIdSet(
    submittedIds: string[],
    expectedIds: string[],
    kind: 'heading' | 'task',
  ) {
    const submitted = new Set(submittedIds);
    const expected = new Set(expectedIds);
    if (submitted.size !== submittedIds.length) {
      throw new BadRequestException(`Duplicate ${kind} id`);
    }
    if (submitted.size !== expected.size || [...submitted].some((id) => !expected.has(id))) {
      throw new BadRequestException(`Invalid or omitted ${kind} id`);
    }
  }

  async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const heading = await tx.projectHeading.findFirst({
        where: { id, userId },
        select: { id: true, projectId: true },
      });
      if (!heading) {
        throw new NotFoundException('Heading not found');
      }
      await this.assertProjectOwnership(userId, heading.projectId, tx);

      const allTasks = await tx.task.findMany({
        where: { userId },
        select: { id: true, parentId: true, headingId: true },
      });
      const childrenOf = new Map<string, string[]>();
      for (const task of allTasks) {
        if (!task.parentId) continue;
        const children = childrenOf.get(task.parentId) ?? [];
        children.push(task.id);
        childrenOf.set(task.parentId, children);
      }

      const ids = new Set(allTasks.filter((task) => task.headingId === id).map((task) => task.id));
      const queue = [...ids];
      while (queue.length > 0) {
        const parentId = queue.shift()!;
        for (const childId of childrenOf.get(parentId) ?? []) {
          if (ids.has(childId)) continue;
          ids.add(childId);
          queue.push(childId);
        }
      }

      const trashedAt = new Date();
      if (ids.size > 0) {
        await tx.task.updateMany({
          where: { id: { in: [...ids] }, userId },
          data: { trashedAt },
        });
      }
      const deleted = await tx.projectHeading.deleteMany({
        where: { id, userId, projectId: heading.projectId },
      });
      if (deleted.count !== 1) {
        throw new BadRequestException('Heading changed; refresh and retry');
      }
      return { id, trashedAt };
    });
  }
}
