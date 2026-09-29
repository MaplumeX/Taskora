import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HeadingLayoutMismatchError,
  headingUnarchivePatch,
  isLayoutTask,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planHeadingToProject,
  sortHeadings,
} from '@taskora/engine';
import { HeadingStatus, TaskStatus } from '@taskora/shared';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { groupPatches, toPrismaData } from '../common/domain-storage';
import { registerCompacted } from '../sync/compact-registry';
import { synthPosition } from '../sync/entity-codec';
import {
  CreateProjectHeadingDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from './dto/project-headings.dto';

/**
 * 分组的 REST 写路径。领域规则（删除 / 归档 / 转项目 / 布局校验与目标
 * 状态、列表顺序）来自 @taskora/engine 的 domain 纯函数，与设备的 Engine
 * 后端共用（local-first-v3 issue 04）。
 */
@Injectable()
export class ProjectHeadingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProjectOwnership(
    userId: string,
    projectId: string,
    tx: Pick<PrismaService, 'project'> = this.prisma,
  ) {
    // 不过滤 trashedAt：废纸篓项目详情页仍需展示/管理 headings，与 ProjectsService.findOne 对齐
    const project = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async findAll(userId: string, projectId: string, includeArchived?: boolean) {
    await this.assertProjectOwnership(userId, projectId);
    const where: { userId: string; projectId: string; status?: HeadingStatus } = {
      userId,
      projectId,
    };
    if (!includeArchived) {
      where.status = HeadingStatus.ACTIVE;
    }
    // 顺序以 domain sortHeadings 为准（与设备同一规则）；SQL 排序只是省一次重排
    return sortHeadings(
      await this.prisma.projectHeading.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    );
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

  /** One heading by id (with project ownership check). */
  async findOne(userId: string, id: string) {
    const heading = await this.prisma.projectHeading.findFirst({
      where: { id, userId },
      select: { id: true, projectId: true, title: true, status: true },
    });
    if (!heading) {
      throw new NotFoundException('Heading not found');
    }
    await this.assertProjectOwnership(userId, heading.projectId);
    return heading;
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

      const plan = planHeadingToProject(heading.title, heading.project.areaId ?? null);
      const newProject = await tx.project.create({
        data: {
          ...(toPrismaData(plan.project) as Prisma.ProjectUncheckedCreateInput),
          sortOrder: nextSortOrder,
          userId,
        },
      });

      // 分组下的全部任务（含 Trash 里的）移入新项目，只改归属
      await tx.task.updateMany({
        where: { userId, headingId: id },
        data: toPrismaData(plan.taskPatch(newProject.id)),
      });

      await registerCompacted(tx, userId, 'project-heading', [id]);
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

  async archive(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const heading = await tx.projectHeading.findFirst({
        where: { id, userId },
        select: { id: true, projectId: true },
      });
      if (!heading) {
        throw new NotFoundException('Heading not found');
      }
      await this.assertProjectOwnership(userId, heading.projectId, tx);

      const tasks = await tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true, status: true, trashedAt: true },
      });
      const plan = planHeadingArchive(new Date().toISOString(), tasks);
      for (const { ids, data } of groupPatches(plan.tasks)) {
        await tx.task.updateMany({ where: { id: { in: ids }, userId }, data });
      }

      const updated = await tx.projectHeading.updateMany({
        where: { id, userId, projectId: heading.projectId },
        data: toPrismaData(plan.heading),
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Heading changed; refresh and retry');
      }

      return tx.projectHeading.findFirst({ where: { id, userId } });
    });
  }

  async unarchive(userId: string, id: string) {
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
        data: headingUnarchivePatch(),
      });
      if (updated.count !== 1) {
        throw new BadRequestException('Heading changed; refresh and retry');
      }

      return tx.projectHeading.findFirst({ where: { id, userId } });
    });
  }

  async reorder(userId: string, dto: ReorderProjectHeadingLayoutDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertProjectOwnership(userId, dto.projectId, tx);

      const [headings, visibleTasks] = await Promise.all([
        tx.projectHeading.findMany({
          where: { userId, projectId: dto.projectId, status: HeadingStatus.ACTIVE },
          select: { id: true },
        }),
        tx.task.findMany({
          where: {
            userId,
            projectId: dto.projectId,
            trashedAt: null,
            status: TaskStatus.ACTIVE,
          },
          select: { id: true, createdAt: true, status: true, trashedAt: true },
        }),
      ]);

      // 校验（与当前数据不符 → 400 要求刷新重试）并得到目标状态
      let plan: ReturnType<typeof planHeadingLayout>;
      try {
        plan = planHeadingLayout(
          dto,
          headings.map((heading) => heading.id),
          visibleTasks.filter(isLayoutTask).map((task) => task.id),
        );
      } catch (error) {
        if (error instanceof HeadingLayoutMismatchError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }

      // 任务双排序键一起写：sortOrder（分组内索引，web REST 读）+
      // position（按整页视觉顺序，由 hub 的合成函数生成）。
      const createdAtOf = new Map(visibleTasks.map((task) => [task.id, task.createdAt]));
      const positionOf = new Map(
        plan.visualTaskIds.map((id, index) => [id, synthPosition(index, createdAtOf.get(id)!)]),
      );
      const sortOrderOf = new Map<string, number>([
        ...dto.ungroupedTaskIds.map((id, index) => [id, index] as const),
        ...dto.groups.flatMap((group) => group.taskIds.map((id, index) => [id, index] as const)),
      ]);

      const writes = await Promise.all([
        ...plan.headingOrder.map(({ id, sortOrder }) =>
          tx.projectHeading.updateMany({
            where: { id, userId, projectId: dto.projectId },
            data: { sortOrder },
          }),
        ),
        ...plan.taskHeading.map(({ id, headingId }) =>
          tx.task.updateMany({
            where: {
              id,
              userId,
              projectId: dto.projectId,
              trashedAt: null,
              status: TaskStatus.ACTIVE,
            },
            data: { headingId, sortOrder: sortOrderOf.get(id)!, position: positionOf.get(id)! },
          }),
        ),
      ]);
      if (writes.some((write) => write.count !== 1)) {
        throw new BadRequestException('Layout changed; refresh and retry');
      }
    });
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

      // 其下直接任务进 Trash（规则见 domain planHeadingDelete）
      const directTasks = await tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true, status: true, trashedAt: true },
      });
      const trashedAt = new Date();
      for (const { ids, data } of groupPatches(
        planHeadingDelete(trashedAt.toISOString(), directTasks),
      )) {
        await tx.task.updateMany({ where: { id: { in: ids }, userId }, data });
      }
      await registerCompacted(tx, userId, 'project-heading', [id]);
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
