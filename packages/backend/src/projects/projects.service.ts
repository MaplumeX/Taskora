import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  countProjectTasks,
  planProjectCreate,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  planReorder,
  positionBetween,
  projectCompletePatch,
  projectReopenPatch,
  projectUpdatePutsBack,
} from '@taskora/engine';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { sortByPosition } from '../common/position-order';
import { countedTasksOf, edgePositions, toWireFields } from '../common/domain-storage';
import { userCalendarZones } from '../users/account-time-zone';
import { CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

/**
 * 项目的 REST 写路径。领域规则（bucket、计划、完成、Trash 级联、进度
 * 计数）来自 @taskora/engine 的 domain 纯函数，与设备的 Engine 后端共用
 * （local-first-v3 issue 04）；写入经 Sync Hub 的合并器（虚拟设备 0，
 * issue 05）。
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: SyncHubService,
  ) {}

  private async requireProject(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

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
    const id = randomUUID();
    const created = await this.hub.writeAsHub(userId, async (batch) => {
      // 新项目排在末尾
      const { last } = await edgePositions(batch.tx, 'Project', userId);
      await batch.write('project', id, {
        ...toWireFields(fields),
        position: positionBetween(last, null),
      });
      return batch.tx.project.findUniqueOrThrow({
        where: { id },
        include: { tags: { include: { tag: true } } },
      });
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
    const existing = await this.requireProject(userId, id);
    const patch = planProjectUpdate(existing, dto, await userCalendarZones(this.prisma, userId));
    // Trash 中改日期 / 区域 / 标签等即放回，级联同 restore
    const restore =
      existing.trashedAt != null && projectUpdatePutsBack(dto)
        ? planProjectRestore(
            existing.trashedAt,
            await this.prisma.task.findMany({
              where: { projectId: id, userId, trashedAt: { not: null } },
              select: { id: true, trashedAt: true },
            }),
          )
        : null;
    const updated = await this.hub.writeAsHub(userId, async (batch) => {
      // 全量 set 语义：tagIds 传 undefined 不动；传数组则整组替换
      await batch.write('project', id, toWireFields({ ...patch, ...restore?.project }));
      for (const task of restore?.tasks ?? []) {
        await batch.write('task', task.id, toWireFields(task.patch));
      }
      return batch.tx.project.findUniqueOrThrow({
        where: { id },
        include: { tags: { include: { tag: true } } },
      });
    });
    return this.withCounts(userId, updated);
  }

  async remove(userId: string, id: string) {
    await this.requireProject(userId, id);
    const now = new Date();
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, userId },
      select: { id: true, trashedAt: true },
    });
    const plan = planProjectTrash(now.toISOString(), tasks);
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(plan.project));
      for (const task of plan.tasks) await batch.write('task', task.id, toWireFields(task.patch));
    });
    return { id, trashedAt: now };
  }

  async restore(userId: string, id: string) {
    const existing = await this.requireProject(userId, id);
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, userId, trashedAt: { not: null } },
      select: { id: true, trashedAt: true },
    });
    const plan = planProjectRestore(existing.trashedAt, tasks);
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(plan.project));
      for (const task of plan.tasks) await batch.write('task', task.id, toWireFields(task.patch));
    });
    return { id, trashedAt: null };
  }

  async complete(userId: string, id: string) {
    await this.requireProject(userId, id);
    return this.writeProject(userId, id, projectCompletePatch(new Date().toISOString()));
  }

  async uncomplete(userId: string, id: string) {
    await this.requireProject(userId, id);
    return this.writeProject(userId, id, projectReopenPatch());
  }

  private writeProject(userId: string, id: string, patch: object) {
    return this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(patch));
      return batch.tx.project.findUniqueOrThrow({ where: { id } });
    });
  }

  async reorder(userId: string, orderedIds: string[]) {
    const owned = await this.prisma.project.findMany({
      where: { id: { in: orderedIds }, userId },
      select: { id: true, position: true },
    });
    const ownedSet = new Set(owned.map((p) => p.id));
    if (ownedSet.size !== orderedIds.length) {
      throw new NotFoundException('Project not found');
    }

    // 只给必须移动的行分配新 Position（与设备 Engine 后端同一口径）
    await this.hub.writeAsHub(userId, async (batch) => {
      for (const { id, patch } of planReorder(owned, orderedIds)) {
        await batch.write('project', id, patch);
      }
    });
  }
}
