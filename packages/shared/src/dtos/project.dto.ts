import type { RepeatRule } from './repeat-rule.dto';
import type { ReviewInterval } from '../review';
import type { TagResponseDto } from './tag.dto';
import { Start } from '../enums/task.enum';
import { ProjectStatus } from '../enums/project.enum';

export interface CreateProjectDto {
  title: string;
  notes?: string;
  areaId?: string;
  scheduledDate?: string; // ISO 8601
  /** 开始状态（ANYTIME / SOMEDAY，Project 不取 INBOX）。 */
  start?: Start;
  dueDate?: string; // ISO 8601
  tagIds?: string[];
  /** 回顾间隔（Review Interval）；缺省取该对象类型的账号默认回顾间隔。 */
  reviewInterval?: ReviewInterval;
  /** 下次回顾日（YYYY-MM-DD）；缺省为今天加生效回顾间隔。 */
  nextReviewDate?: string;
}

export interface UpdateProjectDto {
  title?: string;
  notes?: string;
  areaId?: string | null;
  scheduledDate?: string | null;
  start?: Start;
  dueDate?: string | null;
  tagIds?: string[];
  /** 重复规则（recurring-projects spec）：仅有计划日期的项目可设；null 清除。 */
  repeatRule?: RepeatRule | null;
  /** 回顾间隔：只改间隔，不改写下次回顾日。 */
  reviewInterval?: ReviewInterval;
  /** 下次回顾日（YYYY-MM-DD）。 */
  nextReviewDate?: string;
  /** Hide Later Items：是否隐藏稍后项（列表页的显示状态）。 */
  hideLaterItems?: boolean;
}

/** 完成项目时一并了结剩余（未了结、未进 Trash）任务的方式；缺省不动任务。 */
export type SettleRemainingTasks = 'completed' | 'cancelled';

export interface CompleteProjectDto {
  settleRemaining?: SettleRemainingTasks;
}

export interface ProjectResponseDto {
  id: string;
  title: string;
  notes: string | null;
  areaId: string | null;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；web 与桌面端共用的排序键。 */
  position?: string | null;
  status: ProjectStatus;
  start: Start;
  scheduledDate: string | null;
  dueDate: string | null;
  /** 重复规则（recurring-projects spec）；非重复项目为 null。 */
  repeatRule?: RepeatRule | null;
  /** 派生来源：派生出本项目的重复项目 id；非派生为 null。 */
  repeatSourceId?: string | null;
  /** 出现日（Occurrence Date，YYYY-MM-DD）：为空即等于计划日期。 */
  occurrenceDate?: string | null;
  /** 回顾间隔；null 为存量或不合法数据，按该对象类型的账号默认回顾间隔计算。 */
  reviewInterval?: ReviewInterval | null;
  /** 下次回顾日（YYYY-MM-DD）；null 为存量数据，视为今天待回顾。 */
  nextReviewDate?: string | null;
  /** 上次回顾日（YYYY-MM-DD），只由标记已回顾写入；null 为从未回顾。 */
  lastReviewedOn?: string | null;
  /** Hide Later Items：是否隐藏稍后项；缺省为显示。 */
  hideLaterItems?: boolean;
  completedAt: string | null;
  trashedAt: string | null;
  tags?: TagResponseDto[];
  taskTotalCount: number;
  taskCompletedCount: number;
  createdAt: string;
  updatedAt: string;
}
