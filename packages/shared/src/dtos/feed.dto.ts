import type { TagResponseDto } from './tag.dto';
import { ScheduledType, TaskStatus, TaskBucket } from '../enums/task.enum';
import { ProjectStatus, ProjectBucket } from '../enums/project.enum';

export type FeedItemType = 'task' | 'project';

export type FeedView =
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'anytime'
  | 'someday'
  | 'trash'
  | 'logbook';

export interface FeedItemBase {
  id: string;
  type: FeedItemType;
  title: string;
  notes: string | null;
  scheduledDate: string | null;
  scheduledType: ScheduledType;
  dueDate: string | null;
  status: TaskStatus | ProjectStatus;
  bucket: TaskBucket | ProjectBucket;
  completedAt: string | null;
  trashedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  tags: TagResponseDto[];
}

export interface TaskFeedItem extends FeedItemBase {
  type: 'task';
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
}

export interface ProjectFeedItem extends FeedItemBase {
  type: 'project';
  areaId: string | null;
}

export type FeedItem = TaskFeedItem | ProjectFeedItem;
