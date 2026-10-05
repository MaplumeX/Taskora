import type { RepeatRule } from './repeat-rule.dto';
import type { TagResponseDto } from './tag.dto';
import { ScheduledType } from '../enums/task.enum';
import { ProjectStatus, ProjectBucket } from '../enums/project.enum';

export interface CreateProjectDto {
  title: string;
  notes?: string;
  areaId?: string;
  scheduledDate?: string; // ISO 8601
  scheduledType?: ScheduledType;
  dueDate?: string; // ISO 8601
  bucket?: ProjectBucket;
  tagIds?: string[];
}

export interface UpdateProjectDto {
  title?: string;
  notes?: string;
  areaId?: string | null;
  scheduledDate?: string | null;
  scheduledType?: ScheduledType;
  dueDate?: string | null;
  bucket?: ProjectBucket;
  tagIds?: string[];
  /** 重复规则（recurring-projects spec）：仅 DATE 项目可设；null 清除。 */
  repeatRule?: RepeatRule | null;
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
  bucket: ProjectBucket;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  dueDate: string | null;
  /** 重复规则（recurring-projects spec）；非重复项目为 null。 */
  repeatRule?: RepeatRule | null;
  /** 派生来源：派生出本项目的重复项目 id；非派生为 null。 */
  repeatSourceId?: string | null;
  completedAt: string | null;
  trashedAt: string | null;
  tags?: TagResponseDto[];
  taskTotalCount: number;
  taskCompletedCount: number;
  createdAt: string;
  updatedAt: string;
}