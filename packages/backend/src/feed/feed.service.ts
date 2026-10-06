import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  countProjectTasks,
  feedIncludesProjects,
  hlcIsoTime,
  feedSortKey,
  repositionFeed,
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
  FeedOrderItem,
  FeedView,
  LogbookArchivePage,
  TaskFeedItem,
  ProjectFeedItem,
  TagResponseDto,
} from '@taskora/shared';

import { PrismaService } from '../prisma/prisma.service';
import { SyncHubService } from '../sync/sync-hub.service';
import { calendarContextFor, countedTasksOf } from '../common/domain-storage';
import {
  buildTaskViewWhere,
  hidesTasksInLaterProjects,
  laterProjectIds,
  type TaskView,
} from '../tasks/views';
import { buildProjectViewWhere, type ProjectView } from '../projects/views';
import { parseRepeatRule } from '../tasks/task-dto.mapper';
import { archivedTaskWhere } from '../sync/snapshot-pages';

/** Logbook 归档一页的缺省条数。 */
const ARCHIVE_PAGE_SIZE = 50;

type TaskWithTags = Awaited<ReturnType<PrismaService['task']['findMany']>>[number] & {
  tags: Array<{ tag: Parameters<typeof mapTag>[0] }>;
};

function toTaskFeedItem(t: TaskWithTags): TaskFeedItem {
  return {
    id: t.id,
    type: 'task' as const,
    title: t.title,
    notes: t.notes,
    scheduledDate: t.scheduledDate ? t.scheduledDate.toISOString() : null,
    scheduledType: t.scheduledType as ScheduledType,
    reminderTime: t.reminderTime,
    repeatRule: parseRepeatRule(t.repeatRule),
    repeatSourceId: t.repeatSourceId,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status as TaskStatus,
    bucket: t.bucket as TaskBucket,
    // DTO 字段名保持 completedAt，承载 Settled At 语义（ADR 0006）。
    completedAt: t.settledAt ? t.settledAt.toISOString() : null,
    trashedAt: t.trashedAt ? t.trashedAt.toISOString() : null,
    position: t.position,
    projectId: t.projectId,
    headingId: t.headingId,
    areaId: t.areaId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    tags: t.tags.map((tt) => mapTag(tt.tag)),
  };
}

/**
 * 计划日期最后一次被写入的时刻（New in Today，见 FeedItemBase.scheduledSetAt）：
 * 取 hub 存下的该字段时钟；没有时钟的旧行为 null。
 */
function scheduledSetAtOf(row: { fieldClocks: unknown }): string | null {
  const clocks = row.fieldClocks as Record<string, unknown> | null;
  return hlcIsoTime(clocks?.scheduledDate);
}

/** 归档分页令牌：上一页最后一条的 (settledAt, id)，base64url JSON。 */
function decodeArchiveToken(raw: string): { settledAt: Date; id: string } {
  try {
    const token = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      settledAt?: unknown;
      id?: unknown;
    };
    const settledAt = typeof token.settledAt === 'string' ? new Date(token.settledAt) : null;
    if (settledAt && !Number.isNaN(settledAt.getTime()) && typeof token.id === 'string') {
      return { settledAt, id: token.id };
    }
  } catch {
    // 落到下面的 400
  }
  throw new BadRequestException('无效的 Logbook 分页令牌');
}

function mapTag(tag: {
  id: string;
  title: string;
  color: string;
  position: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TagResponseDto {
  return {
    id: tag.id,
    title: tag.title,
    color: tag.color,
    position: tag.position,
    parentId: tag.parentId,
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

  /**
   * feed 拖拽重排（feed-project-ordering spec）：items 为任务与项目行的
   * 目标显示顺序。只给必须移动的行分配新位次（repositionFeed）：任务写
   * position，项目写 feedPosition，项目的侧边栏 position 不动。
   */
  async reorder(userId: string, items: FeedOrderItem[]): Promise<void> {
    const taskIds = items.filter((item) => item.type === 'task').map((item) => item.id);
    const projectIds = items.filter((item) => item.type === 'project').map((item) => item.id);
    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { id: { in: taskIds }, userId },
        select: { id: true, position: true },
      }),
      this.prisma.project.findMany({
        where: { id: { in: projectIds }, userId },
        select: { id: true, position: true, feedPosition: true },
      }),
    ]);
    if (tasks.length !== new Set(taskIds).size || projects.length !== new Set(projectIds).size) {
      throw new NotFoundException('Feed item not found');
    }
    const taskKey = new Map(tasks.map((task) => [task.id, task.position]));
    const projectKey = new Map(projects.map((project) => [project.id, feedSortKey(project)]));
    const changes = repositionFeed(
      items.map((item) => ({
        ...item,
        key: (item.type === 'task' ? taskKey.get(item.id) : projectKey.get(item.id)) ?? null,
      })),
    );
    if (changes.length === 0) return;
    await this.syncHub.writeAsHub(userId, async (batch) => {
      for (const change of changes) {
        if (change.type === 'task') {
          await batch.write('task', change.id, { position: change.position });
        } else {
          await batch.write('project', change.id, { feedPosition: change.position });
        }
      }
    });
  }

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
    const hideLaterProjectTasks = hidesTasksInLaterProjects(view);
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
    const context = await calendarContextFor(
      this.prisma,
      userId,
      viewNeedsCalendar(view) || hideLaterProjectTasks,
    );
    // 稍后项目内的任务在 Anytime / Someday 中随父项目休眠（Later Project）。
    const hiddenProjectIds = hideLaterProjectTasks
      ? await laterProjectIds(this.prisma, userId, context, context.now)
      : new Set<string>();

    const taskItems: TaskFeedItem[] = tasks
      .filter((task) => !task.projectId || !hiddenProjectIds.has(task.projectId))
      .filter((task) => taskMatchesView(task, view, context))
      .map((task) =>
        view === 'today'
          ? { ...toTaskFeedItem(task), scheduledSetAt: scheduledSetAtOf(task) }
          : toTaskFeedItem(task),
      );

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
        repeatRule: parseRepeatRule(p.repeatRule),
        repeatSourceId: p.repeatSourceId,
        dueDate: p.dueDate ? p.dueDate.toISOString() : null,
        status: p.status as ProjectStatus,
        bucket: p.bucket as ProjectBucket,
        completedAt: p.completedAt ? p.completedAt.toISOString() : null,
        trashedAt: p.trashedAt ? p.trashedAt.toISOString() : null,
        position: p.position,
        feedPosition: p.feedPosition,
        areaId: p.areaId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        tags: p.tags.map((pt) => mapTag(pt.tag)),
        taskTotalCount: total,
        taskCompletedCount: completed,
        ...(view === 'today' ? { scheduledSetAt: scheduledSetAtOf(p) } : {}),
      };
    });

    return sortFeedItems<FeedItem>([...taskItems, ...projectItems], view);
  }

  /**
   * Logbook 的归档部分（local-first-v3 issue 08）：Local Replica 不保留的
   * 归档任务（规则同 bootstrap 的省略规则，截止时刻由设备给出），按了结
   * 时间倒序、(settledAt, id) keyset 分页。只读，不进副本。
   */
  async logbookArchive(
    userId: string,
    settledBefore: Date,
    page?: string,
    limit = ARCHIVE_PAGE_SIZE,
  ): Promise<LogbookArchivePage> {
    const after = page ? decodeArchiveToken(page) : null;
    const rows = await this.prisma.task.findMany({
      where: {
        userId,
        ...archivedTaskWhere(settledBefore),
        ...(after
          ? {
              AND: [
                {
                  OR: [
                    { settledAt: { lt: after.settledAt } },
                    { settledAt: after.settledAt, id: { gt: after.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: { tags: { include: { tag: true } } },
      // 与 Logbook 的本地排序一致（sortFeedItems：了结时间倒序，平局按 id 升序）
      orderBy: [{ settledAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(toTaskFeedItem);
    const last = rows.length > limit ? rows[limit - 1] : null;
    return {
      items,
      ...(last
        ? {
            next: Buffer.from(
              JSON.stringify({ settledAt: last.settledAt!.toISOString(), id: last.id }),
            ).toString('base64url'),
          }
        : {}),
    };
  }
}
