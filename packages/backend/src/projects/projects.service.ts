import { Injectable, NotFoundException } from '@nestjs/common';
import {
  countProjectTasks,
  planProjectCreate,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  projectCompletePatch,
  projectReopenPatch,
} from '@taskora/engine';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { synthPosition } from '../sync/entity-codec';
import { sortByPosition } from '../common/position-order';
import { countedTasksOf, groupPatches, toPrismaData } from '../common/domain-storage';
import { userCalendarZones } from '../users/account-time-zone';
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

/**
 * 项目的 REST 写路径。领域规则（bucket、计划、完成、Trash 级联、进度
 * 计数）来自 @taskora/engine 的 domain 纯函数，与设备的 Engine 后端共用
 * （local-first-v3 issue 04）。
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 一批项目的进度计数（规则见 domain countProjectTasks）。 */
  private async counts(userId: string, projectIds: string[]) {
    return countProjectTasks(projectIds, await countedTasksOf(this.prisma, userId, projectIds));
  }

  private async withCounts<T extends { id: string; tags: Array<{ tag: unknown }> }>(
    userId: string,
    project: T,
  ) {
    const { total, completed } = (await this.counts(userId, [project.id])).get(project.id)!;
    return {
      ...project,
      tags: project.tags.map((pt) => pt.tag),
      taskTotalCount: total,
      taskCompletedCount: completed,
    };
  }

  async create(userId: string, dto: CreateProjectDto) {
    const fields = planProjectCreate(dto, await userCalendarZones(this.prisma, userId));
    const max = await this.prisma.project.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    const created = await this.prisma.project.create({
      data: {
        ...(toPrismaData(fields) as Prisma.ProjectUncheckedCreateInput),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
        userId,
        ...(fields.tagIds.length
          ? { tags: { create: fields.tagIds.map((tagId) => ({ tagId })) } }
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

    const counts = await this.counts(
      userId,
      projects.map((p) => p.id),
    );
    // 按有效 Position 排序（与桌面端副本同一口径）
    return sortByPosition(projects).map((p) => {
      const { total, completed } = counts.get(p.id)!;
      return {
        ...p,
        tags: p.tags.map((pt) => pt.tag),
        taskTotalCount: total,
        taskCompletedCount: completed,
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
    return this.withCounts(userId, project);
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }
    const patch = planProjectUpdate(existing, dto, await userCalendarZones(this.prisma, userId));

    // 全量 set 语义：tagIds 传 undefined 不动；传数组则先删旧关联再建新关联
    if (patch.tagIds !== undefined) {
      await this.prisma.$transaction([
        this.prisma.projectTag.deleteMany({ where: { projectId: id } }),
        ...(patch.tagIds.length > 0
          ? [
              this.prisma.projectTag.createMany({
                data: patch.tagIds.map((tagId) => ({ projectId: id, tagId })),
                skipDuplicates: true,
              }),
            ]
          : []),
      ]);
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: toPrismaData(patch) as Prisma.ProjectUncheckedUpdateInput,
      include: { tags: { include: { tag: true } } },
    });
    return this.withCounts(userId, updated);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const now = new Date();
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, userId },
      select: { id: true, trashedAt: true },
    });
    const plan = planProjectTrash(now.toISOString(), tasks);
    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { id, userId },
        data: toPrismaData(plan.project),
      }),
      ...groupPatches(plan.tasks).map(({ ids, data }) =>
        this.prisma.task.updateMany({ where: { id: { in: ids }, userId }, data }),
      ),
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

    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, userId, trashedAt: { not: null } },
      select: { id: true, trashedAt: true },
    });
    const plan = planProjectRestore(existing.trashedAt, tasks);
    await this.prisma.$transaction([
      this.prisma.project.updateMany({
        where: { id, userId },
        data: toPrismaData(plan.project),
      }),
      ...groupPatches(plan.tasks).map(({ ids, data }) =>
        this.prisma.task.updateMany({ where: { id: { in: ids }, userId }, data }),
      ),
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
      data: toPrismaData(projectCompletePatch(new Date().toISOString())),
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
      data: toPrismaData(projectReopenPatch()),
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.project.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, createdAt: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Project not found');
    }

    // 双排序键一起写（与 TasksService.reorder 同理由）：sortOrder 供 web
    // 端 REST 读，position 供桌面端 Local Replica 读；写入值与 hub 的
    // legacy 合成函数一致。
    const createdAtOf = new Map(owned.map((p) => [p.id, p.createdAt]));
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.project.updateMany({
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
