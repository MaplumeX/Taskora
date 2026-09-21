import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { registerCompacted } from '../sync/compact-registry';
import { buildTaskViewWhere, SETTLED_STATUSES, type TaskView } from '../tasks/views';
import { buildProjectViewWhere, type ProjectView } from '../projects/views';
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
      // 1. 取本用户所有 trashed project 的 id
      const trashedProjects = await tx.project.findMany({
        where: { userId, trashedAt: { not: null } },
        select: { id: true },
      });
      const trashedProjectIds = new Set(trashedProjects.map((p) => p.id));

      // 2. 取本用户所有 task 的 id / projectId / trashedAt
      const allTasks = await tx.task.findMany({
        where: { userId },
        select: { id: true, projectId: true, trashedAt: true },
      });

      // 3. 删除集 = trashed tasks ∪ trashed project 的下属 tasks
      //    Subtask 自动 CASCADE（onDelete: Cascade），无需手工收集后代
      const trashedTaskIds = new Set(allTasks.filter((t) => t.trashedAt !== null).map((t) => t.id));

      // 3a. trashed project 下属任务: projectId ∈ trashedProjectIds 的 task
      const projectOrphanIds = new Set(
        allTasks.filter((t) => t.projectId && trashedProjectIds.has(t.projectId)).map((t) => t.id),
      );

      const taskDeleteIds = new Set<string>([...trashedTaskIds, ...projectOrphanIds]);

      // 3b. DB 级联删除的 Subtask / ProjectHeading 不会产生 collector 事件，
      //     先收集其 id，之后与主体一起下发 Compact Event（ADR-0007：
      //     GC 后压缩变更）。Heading 随 trashed project 的 DB 级联消失，
      //     不登记会永久残留其他设备的副本。
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

      // 4. 物理删除: TaskTag/ProjectTag/Subtask 关联走 onDelete: Cascade 自动清理
      //    where 再带一次 userId 作防御性约束(集合已来自本用户数据,纯双保险)
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
    // Projects never appear in the inbox or anytime feeds —
    // they only surface in schedule/terminal views (today, upcoming,
    // someday, logbook, trash).
    const includeProjects = ['today', 'upcoming', 'someday', 'logbook', 'trash'].includes(view);

    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, ...buildTaskViewWhere(view as TaskView) },
        orderBy:
          view === 'logbook'
            ? [{ settledAt: 'desc' as const }]
            : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }],
        include: { tags: { include: { tag: true } } },
      }),
      includeProjects
        ? this.prisma.project.findMany({
            where: { userId, ...buildProjectViewWhere(view as ProjectView) },
            orderBy:
              view === 'logbook'
                ? [{ completedAt: 'desc' as const }]
                : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }],
            include: { tags: { include: { tag: true } } },
          })
        : Promise.resolve([]),
    ]);

    const taskItems: TaskFeedItem[] = tasks.map((t) => ({
      id: t.id,
      type: 'task' as const,
      title: t.title,
      notes: t.notes,
      scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
      scheduledType: t.scheduledType as ScheduledType,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      status: t.status as TaskStatus,
      bucket: t.bucket as TaskBucket,
      // DTO 字段名保持 completedAt，承载 Settled At 语义（ADR 0006）。
      completedAt: t.settledAt ? t.settledAt.toISOString() : null,
      trashedAt: t.trashedAt ? t.trashedAt.toISOString() : null,
      sortOrder: t.sortOrder,
      projectId: t.projectId,
      headingId: t.headingId,
      areaId: t.areaId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      tags: t.tags.map((tt) => mapTag(tt.tag)),
    }));

    const projectIds = projects.map((p) => p.id);

    // 统计口径：项目下所有非 trashed task（不受 feed view 过滤影响）
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
          // 项目统计口径：completed 计数 = 已了结（完成 + 取消），
          // 与 Logbook Entry 口径一致（ADR 0006）。
          status: { in: [...SETTLED_STATUSES] },
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

    const projectItems: ProjectFeedItem[] = projects.map((p) => {
      const counts = countMap.get(p.id);
      return {
        id: p.id,
        type: 'project' as const,
        title: p.title,
        notes: p.notes,
        scheduledDate: p.scheduledDate ? p.scheduledDate.toISOString() : null,
        scheduledType: p.scheduledType as ScheduledType,
        dueDate: p.dueDate ? p.dueDate.toISOString() : null,
        status: p.status as ProjectStatus,
        bucket: p.bucket as ProjectBucket,
        completedAt: p.completedAt ? p.completedAt.toISOString() : null,
        trashedAt: p.trashedAt ? p.trashedAt.toISOString() : null,
        sortOrder: p.sortOrder,
        areaId: p.areaId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        tags: p.tags.map((pt) => mapTag(pt.tag)),
        taskTotalCount: counts?.total ?? 0,
        taskCompletedCount: counts?.completed ?? 0,
      };
    });

    // Merge and sort: default sortOrder asc, createdAt desc; logbook already
    // sorted by completedAt desc from each query, but since we mix two sources
    // we re-sort the merged list for logbook.
    const items: FeedItem[] = [...taskItems, ...projectItems];

    if (view === 'logbook') {
      items.sort((a, b) => {
        const ac = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bc = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bc - ac;
      });
    } else {
      items.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return items;
  }
}
