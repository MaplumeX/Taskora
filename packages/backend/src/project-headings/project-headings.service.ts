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

  async convertToProject(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Validate heading ownership and read the source project's areaId.
      const heading = await tx.projectHeading.findFirst({
        where: { id, userId },
        include: { project: { select: { areaId: true } } },
      });
      if (!heading) {
        throw new NotFoundException('Heading not found');
      }
      await this.assertProjectOwnership(userId, heading.projectId, tx);

      // New project is appended after the user's last project in the sidebar.
      const maxSort = await tx.project.aggregate({
        where: { userId },
        _max: { sortOrder: true },
      });
      const nextSortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      const newProject = await tx.project.create({
        data: {
          title: heading.title,
          areaId: heading.project.areaId ?? null,
          sortOrder: nextSortOrder,
          userId,
        },
      });

      // Move every task under the heading (including trashed ones) to the new
      // project. Only projectId/headingId change; bucket/sortOrder/status/notes
      // and the subtask tree are preserved as-is.
      await tx.task.updateMany({
        where: { userId, headingId: id },
        data: { projectId: newProject.id, headingId: null },
      });

      const deleted = await tx.projectHeading.deleteMany({
        where: { id, userId, projectId: heading.projectId },
      });
      if (deleted.count !== 1) {
        throw new BadRequestException('Heading changed; refresh and retry');
      }

      return { ...newProject, tags: [] };
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

      // Soft-delete all tasks directly under this heading.
      // Subtasks are not trashed (they stay until parent is physically deleted).
      const directTasks = await tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true },
      });
      const trashedAt = new Date();
      if (directTasks.length > 0) {
        await tx.task.updateMany({
          where: { id: { in: directTasks.map((t) => t.id) }, userId },
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
