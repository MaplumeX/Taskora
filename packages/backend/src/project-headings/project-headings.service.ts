import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  HeadingLayoutMismatchError,
  headingUnarchivePatch,
  isLayoutTask,
  planHeadingArchive,
  planHeadingDelete,
  planHeadingLayout,
  planHeadingToProject,
  planReorder,
  positionAtEnd,
  positionBetween,
  sortHeadings,
} from '@taskora/engine';
import { HeadingStatus, TaskStatus } from '@taskora/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { edgePositions, toWireFields } from '../common/domain-storage';
import { SyncHubService, type HubWriteBatch } from '../sync/sync-hub.service';
import {
  CreateProjectHeadingDto,
  ReorderProjectHeadingLayoutDto,
  UpdateProjectHeadingDto,
} from './dto/project-headings.dto';

/**
 * 分组的 REST 写路径。领域规则（删除 / 归档 / 转项目 / 布局校验与目标
 * 状态、列表顺序）来自 @taskora/engine 的 domain 纯函数，与设备的 Engine
 * 后端共用（local-first-v3 issue 04）；写入经 Sync Hub 的合并器（虚拟
 * 设备 0，issue 05）。
 */
@Injectable()
export class ProjectHeadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  private async assertProjectOwnership(
    userId: string,
    projectId: string,
    tx: Pick<Prisma.TransactionClient, 'project'> = this.prisma,
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
    // 顺序以 domain sortHeadings 为准（与设备同一规则）
    return sortHeadings(await this.prisma.projectHeading.findMany({ where }));
  }

  async create(userId: string, dto: CreateProjectHeadingDto) {
    await this.assertProjectOwnership(userId, dto.projectId);
    // 追加末尾
    const siblings = await this.prisma.projectHeading.findMany({
      where: { userId, projectId: dto.projectId },
      select: { id: true, position: true },
    });
    const id = randomUUID();
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project-heading', id, {
        title: dto.title,
        position: positionAtEnd(siblings),
        status: HeadingStatus.ACTIVE,
        completedAt: null,
        projectId: dto.projectId,
      });
      return batch.tx.projectHeading.findUniqueOrThrow({ where: { id } });
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

  /** 批内读本用户的分组并校验项目归属，不存在即 404。 */
  private async requireHeading(batch: HubWriteBatch, userId: string, id: string) {
    const heading = await batch.tx.projectHeading.findFirst({
      where: { id, userId },
      include: { project: { select: { areaId: true } } },
    });
    if (!heading) {
      throw new NotFoundException('Heading not found');
    }
    await this.assertProjectOwnership(userId, heading.projectId, batch.tx);
    return heading;
  }

  async convertToProject(userId: string, id: string) {
    return this.hub.writeAsHub(userId, async (batch) => {
      const heading = await this.requireHeading(batch, userId, id);

      // New project is appended after the user's last project in the sidebar.
      const { last } = await edgePositions(batch.tx, 'Project', userId);
      const plan = planHeadingToProject(heading.title, heading.project.areaId ?? null);
      const projectId = randomUUID();
      await batch.write('project', projectId, {
        ...toWireFields(plan.project),
        position: positionBetween(last, null),
      });

      // 分组下的全部任务（含 Trash 里的）移入新项目，只改归属
      const tasks = await batch.tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true },
      });
      for (const task of tasks) {
        await batch.write('task', task.id, toWireFields(plan.taskPatch(projectId)));
      }

      await batch.delete('project-heading', [id]);

      const project = await batch.tx.project.findUniqueOrThrow({ where: { id: projectId } });
      return { ...project, tags: [] };
    });
  }

  async update(userId: string, id: string, dto: UpdateProjectHeadingDto) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.requireHeading(batch, userId, id);
      if (dto.title !== undefined) await batch.write('project-heading', id, { title: dto.title });
      return batch.tx.projectHeading.findFirst({ where: { id, userId } });
    });
  }

  async archive(userId: string, id: string) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.requireHeading(batch, userId, id);
      const tasks = await batch.tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true, status: true, trashedAt: true },
      });
      const plan = planHeadingArchive(new Date().toISOString(), tasks);
      for (const task of plan.tasks) await batch.write('task', task.id, toWireFields(task.patch));
      await batch.write('project-heading', id, toWireFields(plan.heading));
      return batch.tx.projectHeading.findFirst({ where: { id, userId } });
    });
  }

  async unarchive(userId: string, id: string) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.requireHeading(batch, userId, id);
      await batch.write('project-heading', id, toWireFields(headingUnarchivePatch()));
      return batch.tx.projectHeading.findFirst({ where: { id, userId } });
    });
  }

  async reorder(userId: string, dto: ReorderProjectHeadingLayoutDto) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.assertProjectOwnership(userId, dto.projectId, batch.tx);

      const [headings, visibleTasks] = await Promise.all([
        batch.tx.projectHeading.findMany({
          where: { userId, projectId: dto.projectId, status: HeadingStatus.ACTIVE },
          select: { id: true, position: true },
        }),
        batch.tx.task.findMany({
          where: {
            userId,
            projectId: dto.projectId,
            trashedAt: null,
            status: TaskStatus.ACTIVE,
          },
          select: { id: true, position: true, status: true, trashedAt: true },
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

      // 与设备 Engine 后端同一口径：分组位次与任务位次（按整页视觉顺序）都只给
      // 必须移动的行分配新键；归属值未变的字段由 hub 跳过。
      const taskPosition = new Map(
        planReorder(visibleTasks, plan.visualTaskIds).map(({ id, patch }) => [id, patch.position]),
      );
      for (const { id, patch } of planReorder(headings, plan.headingOrder)) {
        await batch.write('project-heading', id, patch);
      }
      for (const { id, headingId } of plan.taskHeading) {
        const position = taskPosition.get(id);
        await batch.write('task', id, { headingId, ...(position ? { position } : {}) });
      }
    });
  }

  async remove(userId: string, id: string) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await this.requireHeading(batch, userId, id);

      // 其下直接任务进 Trash（规则见 domain planHeadingDelete）
      const directTasks = await batch.tx.task.findMany({
        where: { userId, headingId: id },
        select: { id: true, status: true, trashedAt: true },
      });
      const trashedAt = new Date();
      for (const task of planHeadingDelete(trashedAt.toISOString(), directTasks)) {
        await batch.write('task', task.id, toWireFields(task.patch));
      }
      await batch.delete('project-heading', [id]);
      return { id, trashedAt };
    });
  }
}
