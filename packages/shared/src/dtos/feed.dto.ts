import type { TagResponseDto } from './tag.dto';
import type { RepeatRule } from './repeat-rule.dto';
import { ScheduledType, TaskStatus, TaskBucket } from '../enums/task.enum';
import { ProjectStatus, ProjectBucket } from '../enums/project.enum';

export type FeedItemType = 'task' | 'project';

export type FeedView = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'trash' | 'logbook';

export interface FeedItemBase {
  id: string;
  type: FeedItemType;
  title: string;
  notes: string | null;
  scheduledDate: string | null;
  scheduledType: ScheduledType;
  /** 提醒时刻（Reminder，HH:mm）；project 恒为 null（Project 不设 Reminder）。 */
  reminderTime: string | null;
  /** 重复规则（Repeat Rule）；project 恒为 null（Project 不设 Repeat Rule）。 */
  repeatRule: RepeatRule | null;
  /** 派生来源（Repeat Instance）；project 恒为 null。 */
  repeatSourceId: string | null;
  dueDate: string | null;
  status: TaskStatus | ProjectStatus;
  bucket: TaskBucket | ProjectBucket;
  /** 了结时间（Settled At，ADR 0006）：task 的 COMPLETED/CANCELLED 与 project 的 COMPLETED 共用此字段；名称保留 completedAt 以兼容前端。 */
  completedAt: string | null;
  trashedAt: string | null;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；web 与桌面端共用的排序键。 */
  position?: string | null;
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
  /**
   * Feed Position：项目行在 feed 中与任务混排的位次（与任务 position 同一键
   * 空间）；为空时 feed 按 position 排。只影响 feed，不影响侧边栏顺序。
   */
  feedPosition?: string | null;
  areaId: string | null;
  taskTotalCount: number;
  taskCompletedCount: number;
}

export type FeedItem = TaskFeedItem | ProjectFeedItem;

/** feed 拖拽重排的一行（任务或项目行），按目标显示顺序排列。 */
export interface FeedOrderItem {
  type: FeedItemType;
  id: string;
}

/**
 * feed 拖拽重排：items 为任务与项目行的目标显示顺序。只为必须移动的行
 * 分配新位次——任务写 position，项目写 feedPosition（不动侧边栏顺序）。
 */
export interface ReorderFeedDto {
  items: FeedOrderItem[];
}

/**
 * Logbook 的归档部分（local-first-v3 issue 08）：Local Replica 不保留的
 * 旧 Logbook Entry，按了结时间倒序从 hub 分页读取，只读。
 */
export interface LogbookArchivePage {
  items: TaskFeedItem[];
  /** 下一页令牌；缺省即已到底。 */
  next?: string;
}
