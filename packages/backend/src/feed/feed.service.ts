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
    return this.syncHub.writeAsHub(userId, async (batch) => {
      // 删除集（规则见 domain planEmptyTrash）：Trash 里的任务与项目，及
      // Trash 里项目下的全部任务。
      const [projects, tasks] = await Promise.all([
        batch.tx.project.findMany({
          where: { userId, trashedAt: { not: null } },
          select: { id: true, trashedAt: true },
        }),
        batch.tx.task.findMany({
          where: { userId },
          select: { id: true, projectId: true, trashedAt: true },
        }),
      ]);
      const plan = planEmptyTrash(projects, tasks);
      // 与 Delete Request 同一路径：Subtask / 分组按 DELETE_CASCADES 级联，
      // Compact 登记、物理删除与 Compact Event 同事务提交——bootstrap 永远
      // 知道这些 id 已删除，迟到的字段写也不会复活它们。
      await batch.delete('task', plan.taskIds);
      await batch.delete('project', plan.projectIds);
      return { deletedTasks: plan.taskIds.length, deletedProjects: plan.projectIds.length };
    });
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
