import type { TagResponseDto } from './tag.dto';
import type { AttachmentResponseDto } from './attachment.dto';
import type { SubtaskResponseDto } from './subtask.dto';
import type { RepeatRule } from './repeat-rule.dto';
import { Start, TaskStatus } from '../enums/task.enum';

export type { RepeatRule, RepeatUnit, RepeatAnchor } from './repeat-rule.dto';

export interface CreateTaskDto {
  title: string;
  /**
   * 客户端预生成的 UUID（App 外写入：Android 快速添加入队时生成，hub 与设备
   * 落库同一条草稿时得到同一任务）。该 id 已存在即视为已创建，返回现有任务。
   */
  id?: string;
  notes?: string;
  /** 计划日期（ISO 8601）；设了日期时 start 恒为 ANYTIME。 */
  scheduledDate?: string;
  /** 开始状态；缺省时有归属或日期为 ANYTIME，否则 INBOX。 */
  start?: Start;
  dueDate?: string; // ISO 8601（截止日期，默认 null）
  projectId?: string;
  areaId?: string;
  tagIds?: string[];
}

export interface UpdateTaskDto {
  title?: string;
  notes?: string;
  /** 计划日期；设日期即 start 为 ANYTIME，null 清除。 */
  scheduledDate?: string | null;
  /**
   * 开始状态。SOMEDAY 清除计划日期；INBOX 同时清除归属与计划（保留截止
   * 日期）；ANYTIME 且不带 scheduledDate 时保留原日期。
   */
  start?: Start;
  /** 提醒时刻（Reminder，HH:mm，本地时区语义）：仅有计划日期时有效；null 清除。 */
  reminderTime?: string | null;
  /**
   * 重复规则（Repeat Rule）：仅有计划日期时有效；清除日期时数据层自动清除
   * （null）。写入时归一化为规范形（派生 id 依赖稳定输入）。
   */
  repeatRule?: RepeatRule | null;
  dueDate?: string | null;
  projectId?: string | null;
  areaId?: string | null;
  tagIds?: string[];
}

export interface TaskResponseDto {
  id: string;
  title: string;
  notes: string | null;
  scheduledDate: string | null; // 计划日期（原 dueDate）
  start: Start;
  /** 提醒时刻（Reminder，HH:mm）：依附于计划日期，到点由客户端本地触发系统通知；null 表示未设置。 */
  reminderTime: string | null;
  /** 重复规则（Repeat Rule）：完成后按规则派生下一实例；已了结任务保留该字段作 Logbook 溯源；null 表示未设置。 */
  repeatRule: RepeatRule | null;
  /** 派生来源（Repeat Instance）：派生出本任务的那个重复任务的 id；非派生任务为 null。 */
  repeatSourceId: string | null;
  dueDate: string | null; // 截止日期：必须完成日，可逾期（与 scheduledDate「计划开始做、永不逾期」对立）
  status: TaskStatus;
  /** 了结时间（Settled At，ADR 0006）：status 为 COMPLETED/CANCELLED 时的了结时刻；字段名保留 completedAt 以兼容前端。 */
  completedAt: string | null;
  trashedAt: string | null;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；web 与桌面端共用的排序键。 */
  position?: string | null;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tags?: TagResponseDto[];
  subtasks?: SubtaskResponseDto[];
  /** 附件（ADR-0019），按位次排序；只在任务详情里下发。 */
  attachments?: AttachmentResponseDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 任务搜索的相关度档位（Quick Find）：标题前缀命中 > 标题包含 > 仅备注或
 * Subtask 标题命中。
 */
export type TaskSearchRank = 'titlePrefix' | 'title' | 'other';

/** 任务搜索的一条命中：命中的任务，及其标题命中的 Subtask（按排序位次）。 */
export interface TaskSearchHit {
  task: TaskResponseDto;
  matchedSubtasks: Array<{ id: string; title: string }>;
  rank: TaskSearchRank;
}
