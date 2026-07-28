import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildTaskViewWhere, type TaskView } from '../tasks/views';
import { buildProjectViewWhere, type ProjectView } from '../projects/views';
import { ScheduledType, TaskStatus, TaskBucket, ProjectStatus, ProjectBucket } from '@taskora/shared';
import type { FeedItem, FeedView, TaskFeedItem, ProjectFeedItem, TagResponseDto } from '@taskora/shared';

function mapTag(tag: { id: string; title: string; color: string; sortOrder: number; tagGroupId: string | null; createdAt: Date; updatedAt: Date }): TagResponseDto {
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
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, view: FeedView): Promise<FeedItem[]> {
    const [tasks, projects] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, ...buildTaskViewWhere(view as TaskView) },
        orderBy:
          view === 'logbook'
            ? [{ completedAt: 'desc' as const }]
            : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }],
        include: { tags: { include: { tag: true } } },
      }),
      this.prisma.project.findMany({
        where: { userId, ...buildProjectViewWhere(view as ProjectView) },
        orderBy:
          view === 'logbook'
            ? [{ completedAt: 'desc' as const }]
            : [{ sortOrder: 'asc' as const }, { createdAt: 'desc' as const }],
        include: { tags: { include: { tag: true } } },
      }),
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
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      trashedAt: t.trashedAt ? t.trashedAt.toISOString() : null,
      sortOrder: t.sortOrder,
      parentId: t.parentId,
      projectId: t.projectId,
      areaId: t.areaId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      tags: t.tags.map((tt) => mapTag(tt.tag)),
    }));

    const projectItems: ProjectFeedItem[] = projects.map((p) => ({
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
    }));

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