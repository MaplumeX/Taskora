import { Injectable } from '@nestjs/common';
import {
  countProjectTasks,
  feedIncludesProjects,
  planEmptyTrash,
  projectMatchesView,
  sortFeedItems,
  taskMatchesView,
  viewNeedsCalendar,
} from '@taskora/engine';
import {
  ScheduledType,
  TaskStatus,
  TaskBucket,
  ProjectStatus,
  ProjectBucket,
} from '@taskora/shared';
import type {
  FeedItem,
  FeedView,
  TaskFeedItem,
  ProjectFeedItem,
  TagResponseDto,
} from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { registerCompacted } from '../sync/compact-registry';
import { calendarContextFor, countedTasksOf } from '../common/domain-storage';
import { buildTaskViewWhere, type TaskView } from '../tasks/views';
import { buildProjectViewWhere, type ProjectView } from '../projects/views';
import { parseRepeatRule } from '../tasks/task-dto.mapper';

function mapTag(tag: {
  id: string;
  title: string;
  color: string;
  sortOrder: number;
  tagGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TagResponseDto {
  return {
    id: tag.id,
    title: tag.title,
    color: tag.color,
    sortOrder: tag.sortOrder,
    tagGroupId: tag.tagGroupId,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncHub: SyncHubService,
  ) {}

  async emptyTrash(userId: string): Promise<{ deletedTasks: number; deletedProjects: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 删除集（规则见 domain planEmptyTrash）：Trash 里的任务与项目，及
      // Trash 里项目下的全部任务。Subtask / 分组随 DB 级联。
      const [projects, tasks] = await Promise.all([
        tx.project.findMany({
          where: { userId, trashedAt: { not: null } },
          select: { id: true, trashedAt: true },
        }),
        tx.task.findMany({
          where: { userId },
          select: { id: true, projectId: true, trashedAt: true },
        }),
      ]);
      const plan = planEmptyTrash(projects, tasks);
      const taskDeleteIds = new Set(plan.taskIds);
      const trashedProjectIds = new Set(plan.projectIds);

      // DB 级联删除的 Subtask / ProjectHeading 不会产生 collector 事件，
      // 先收集其 id，之后与主体一起下发 Compact Event（ADR-0007：
      // GC 后压缩变更）。Heading 随 trashed project 的 DB 级联消失，
      // 不登记会永久残留其他设备的副本。
      const cascadedSubtaskIds = taskDeleteIds.size
        ? (
            await tx.subtask.findMany({
              where: { taskId: { in: [...taskDeleteIds] } },
              select: { id: true },
            })
          ).map((s) => s.id)
        : [];
      const cascadedHeadingIds = trashedProjectIds.size
        ? (
            await tx.projectHeading.findMany({
              where: { projectId: { in: [...trashedProjectIds] } },
              select: { id: true },
            })
          ).map((h) => h.id)
        : [];

      // Compact 登记与物理删除同事务提交。即使进程在提交后、广播前退出，
      // bootstrap 仍能知道这些 id 永久删除，迟到字段写也不会复活它们。
      await registerCompacted(tx, userId, 'task', [...taskDeleteIds]);
      await registerCompacted(tx, userId, 'project', [...trashedProjectIds]);
      await registerCompacted(tx, userId, 'subtask', cascadedSubtaskIds);
      await registerCompacted(tx, userId, 'project-heading', cascadedHeadingIds);

      // 物理删除: TaskTag/ProjectTag/Subtask 关联走 onDelete: Cascade 自动清理
      // where 再带一次 userId 作防御性约束(集合已来自本用户数据,纯双保险)
      const taskDelete = await tx.task.deleteMany({
        where: { id: { in: [...taskDeleteIds] }, userId },
      });
      const projectDelete = await tx.project.deleteMany({
        where: { id: { in: [...trashedProjectIds] }, userId },
      });

      return {
        deletedTasks: taskDelete.count,
        deletedProjects: projectDelete.count,
        taskIds: [...taskDeleteIds],
        projectIds: [...trashedProjectIds],
        cascadedSubtaskIds,
        cascadedHeadingIds,
      };
    });
    // 事务提交后再广播；collector 产生的重复 Compact 对设备幂等。
    await this.syncHub.publishCompact(userId, 'task', result.taskIds);
    await this.syncHub.publishCompact(userId, 'project', result.projectIds);
    await this.syncHub.publishCompact(userId, 'subtask', result.cascadedSubtaskIds);
    await this.syncHub.publishCompact(userId, 'project-heading', result.cascadedHeadingIds);
    return { deletedTasks: result.deletedTasks, deletedProjects: result.deletedProjects };
  }

  async findAll(userId: string, view: FeedView): Promise<FeedItem[]> {
    // SQL 只是粗筛；最终过滤、计数与排序按 domain 规则（与设备同一份）
    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, ...buildTaskViewWhere(view as TaskView) },
        include: { tags: { include: { tag: true } } },
      }),
      feedIncludesProjects(view)
        ? this.prisma.project.findMany({
            where: { userId, ...buildProjectViewWhere(view as ProjectView) },
            include: { tags: { include: { tag: true } } },
          })
        : Promise.resolve([]),
    ]);
    const context = await calendarContextFor(this.prisma, userId, viewNeedsCalendar(view));

    const taskItems: TaskFeedItem[] = tasks
      .filter((task) => taskMatchesView(task, view, context))
      .map((t) => ({
        id: t.id,
        type: 'task' as const,
        title: t.title,
        notes: t.notes,
        scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
        scheduledType: t.scheduledType as ScheduledType,
        reminderTime: t.reminderTime,
        repeatRule: parseRepeatRule(t.repeatRule),
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        status: t.status as TaskStatus,
        bucket: t.bucket as TaskBucket,
        // DTO 字段名保持 completedAt，承载 Settled At 语义（ADR 0006）。
        completedAt: t.settledAt ? t.settledAt.toISOString() : null,
        trashedAt: t.trashedAt ? t.trashedAt.toISOString() : null,
        sortOrder: t.sortOrder,
        position: t.position,
        projectId: t.projectId,
        headingId: t.headingId,
        areaId: t.areaId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        tags: t.tags.map((tt) => mapTag(tt.tag)),
      }));

    const visibleProjects = projects.filter((project) =>
      projectMatchesView(project, view, context),
    );
    const projectIds = visibleProjects.map((p) => p.id);
    const counts = countProjectTasks(
      projectIds,
      await countedTasksOf(this.prisma, userId, projectIds),
    );

    const projectItems: ProjectFeedItem[] = visibleProjects.map((p) => {
      const { total, completed } = counts.get(p.id)!;
      return {
        id: p.id,
        type: 'project' as const,
        title: p.title,
        notes: p.notes,
        scheduledDate: p.scheduledDate ? p.scheduledDate.toISOString() : null,
        scheduledType: p.scheduledType as ScheduledType,
        reminderTime: null, // Project 不设 Reminder（CONTEXT.md）
        repeatRule: null, // Project 不设 Repeat Rule（CONTEXT.md）
        dueDate: p.dueDate ? p.dueDate.toISOString() : null,
        status: p.status as ProjectStatus,
        bucket: p.bucket as ProjectBucket,
        completedAt: p.completedAt ? p.completedAt.toISOString() : null,
        trashedAt: p.trashedAt ? p.trashedAt.toISOString() : null,
        sortOrder: p.sortOrder,
        position: p.position,
        areaId: p.areaId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        tags: p.tags.map((pt) => mapTag(pt.tag)),
        taskTotalCount: total,
        taskCompletedCount: completed,
      };
    });

    return sortFeedItems<FeedItem>([...taskItems, ...projectItems], view);
  }
}
