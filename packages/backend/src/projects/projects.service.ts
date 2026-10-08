import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  countProjectTasks,
  planMarkReviewed,
  planProjectComplete,
  planProjectCreate,
  planProjectRepeatSkip,
  planProjectRestore,
  planProjectTrash,
  planProjectUpdate,
  planRepeatProjectInstance,
  planReorder,
  positionBetween,
  projectReopenPatch,
  projectUpdatePutsBack,
  repeatDerivationTarget,
} from '@taskora/engine';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService, type HubWriteBatch } from '../sync/sync-hub.service';
import { parseRepeatRule, withRepeatRuleDto } from '../tasks/task-dto.mapper';
import { sortByPosition } from '../common/position-order';
import { countedTasksOf, edgePositions, toWireFields } from '../common/domain-storage';
import { parseReviewInterval, withReviewDto } from '../common/review-dto';
import { userCalendarZones, userReviewSettings } from '../users/account-time-zone';
import { CompleteProjectDto, CreateProjectDto, UpdateProjectDto } from './dto/projects.dto';

/** 派生路径需要的 Project 行形状（含标签关系）。 */
type ProjectRowWithTags = Prisma.ProjectGetPayload<{ include: { tags: true } }>;

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

  private async withCounts<
    T extends {
      id: string;
      repeatRule: string | null;
      reviewInterval: string | null;
      tags: Array<{ tag: unknown }>;
    },
  >(userId: string, project: T) {
    const { total, completed } = (await this.counts(userId, [project.id])).get(project.id)!;
    return {
      ...withReviewDto(withRepeatRuleDto(project)),
      tags: project.tags.map((pt) => pt.tag),
      taskTotalCount: total,
      taskCompletedCount: completed,
    };
  }

  async create(userId: string, dto: CreateProjectDto) {
    const { zones, review } = await userReviewSettings(this.prisma, userId);
    const fields = planProjectCreate(dto, zones, review);
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
      ...withReviewDto(withRepeatRuleDto(created)),
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
        ...withReviewDto(withRepeatRuleDto(p)),
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

  /**
   * 完成项目（recurring-projects spec）：settleRemaining 给出时一并了结
   * 剩余任务；带重复规则时代为派生下一轮（web 无本地副本，同任务的
   * REST 派生，ADR-0012）。已完成的再次完成不改写、不二次派生。
   */
  async complete(userId: string, id: string, dto: CompleteProjectDto = {}) {
    const existing = await this.prisma.project.findFirst({
      where: { id, userId },
      include: { tags: true },
    });
    if (!existing) {
      throw new NotFoundException('Project not found');
    }
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, userId },
      include: { tags: true },
    });
    const completedAt = new Date().toISOString();
    const plan = planProjectComplete(existing.status, completedAt, tasks, dto.settleRemaining);
    if (!plan) return this.findOne(userId, id);
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(plan.project));
      for (const task of plan.tasks) await batch.write('task', task.id, toWireFields(task.patch));
      if (plan.deriveRepeat) {
        await this.deriveRepeatProject(batch, userId, existing, tasks, completedAt);
      }
    });
    return this.findOne(userId, id);
  }

  /**
   * 重复项目服务端派生（规则见 domain planRepeatProjectInstance）：与设备
   * 派生产出同一组确定性 id，经 hub 字段级 LWW 收敛。parent / tasks 取完成
   * 前的状态。
   */
  private async deriveRepeatProject(
    batch: HubWriteBatch,
    userId: string,
    parent: ProjectRowWithTags,
    tasks: ReadonlyArray<Prisma.TaskGetPayload<{ include: { tags: true } }>>,
    completedAt: string,
  ): Promise<void> {
    const repeatRule = parseRepeatRule(parent.repeatRule);
    if (!repeatRule) return; // 非重复项目：不必查账号时区
    const { zones, review } = await userReviewSettings(this.prisma, userId);
    const plan = planRepeatProjectInstance(
      {
        id: parent.id,
        title: parent.title,
        notes: parent.notes,
        scheduledDate: parent.scheduledDate,
        dueDate: parent.dueDate,
        repeatRule,
        reviewInterval: parseReviewInterval(parent.reviewInterval),
        areaId: parent.areaId,
        tagIds: parent.tags.map((pt) => pt.tagId),
      },
      completedAt,
      zones,
      review,
    );
    if (!plan) return;
    const linked = await batch.tx.project.findFirst({
      where: { userId, repeatSourceId: parent.id, trashedAt: null },
      select: { id: true },
    });
    const plannedRow = await batch.tx.project.findFirst({
      where: { id: plan.id, userId },
      select: { trashedAt: true },
    });
    const compacted =
      !plannedRow &&
      (await batch.tx.compactedEntity.findFirst({
        where: { userId, entity: 'project', entityId: plan.id },
        select: { entityId: true },
      })) !== null;
    const target = repeatDerivationTarget({
      hasLinkedInstance: linked !== null,
      plannedId: plannedRow
        ? plannedRow.trashedAt
          ? 'trashed'
          : 'live'
        : compacted
          ? 'compacted'
          : 'absent',
    });
    if (target === 'skip') return;
    const instanceId = target === 'planned' ? plan.id : randomUUID();

    // 侧边栏中紧跟来源项目
    const projects = sortByPosition(
      await batch.tx.project.findMany({
        where: { userId },
        select: { id: true, position: true },
      }),
    );
    const at = projects.findIndex((p) => p.id === parent.id);
    await batch.write('project', instanceId, {
      ...toWireFields(plan.project),
      position: positionBetween(projects[at]?.position ?? null, projects[at + 1]?.position ?? null),
    });

    const taskIds = { in: tasks.map((task) => task.id) };
    const [headings, subtasks, attachments] = await Promise.all([
      batch.tx.projectHeading.findMany({ where: { projectId: parent.id } }),
      batch.tx.subtask.findMany({ where: { taskId: taskIds } }),
      batch.tx.attachment.findMany({ where: { taskId: taskIds } }),
    ]);
    const copy = plan.copyFor(instanceId, {
      headings,
      tasks: tasks.map((task) => ({
        ...task,
        repeatRule: parseRepeatRule(task.repeatRule),
        tagIds: task.tags.map((tt) => tt.tagId),
      })),
      subtasks,
      attachments,
    });
    for (const { id, ...heading } of copy.headings) {
      await batch.write('project-heading', id, heading);
    }
    for (const { id, ...task } of copy.tasks) await batch.write('task', id, toWireFields(task));
    for (const { id, ...subtask } of copy.subtasks) await batch.write('subtask', id, subtask);
    for (const { id, ...attachment } of copy.attachments) {
      await batch.write('attachment', id, attachment);
    }
  }

  /** 标记已回顾：下次回顾日为今天加回顾间隔（规则见 domain planMarkReviewed）。 */
  async markReviewed(userId: string, id: string) {
    const existing = await this.requireProject(userId, id);
    const { review } = await userReviewSettings(this.prisma, userId);
    const patch = planMarkReviewed(
      { reviewInterval: parseReviewInterval(existing.reviewInterval) },
      review,
    );
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(patch));
    });
    return this.findOne(userId, id);
  }

  async uncomplete(userId: string, id: string) {
    await this.requireProject(userId, id);
    // 只重开项目本身：已了结的任务与已派生的下一轮不动（recurring-projects spec）
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(projectReopenPatch()));
    });
    return this.findOne(userId, id);
  }

  /**
   * 跳过本次（recurring-projects spec）：项目计划日期推进到下一次，项目内
   * 未了结任务的日期同步平移（规则见 domain planProjectRepeatSkip）。
   * 不可跳过 → 409，message 为原因（RepeatSkipBlock）。
   */
  async skip(userId: string, id: string) {
    const existing = await this.requireProject(userId, id);
    const [linked, tasks] = await Promise.all([
      this.prisma.project.findFirst({
        where: { userId, repeatSourceId: id, trashedAt: null },
        select: { id: true },
      }),
      this.prisma.task.findMany({ where: { projectId: id, userId } }),
    ]);
    const plan = planProjectRepeatSkip(
      { ...existing, repeatRule: parseRepeatRule(existing.repeatRule) },
      tasks,
      linked !== null,
      new Date().toISOString(),
      await userCalendarZones(this.prisma, userId),
    );
    if ('blocked' in plan) throw new ConflictException(plan.blocked);
    await this.hub.writeAsHub(userId, async (batch) => {
      await batch.write('project', id, toWireFields(plan.project));
      for (const task of plan.tasks) await batch.write('task', task.id, toWireFields(task.patch));
    });
    return this.findOne(userId, id);
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
