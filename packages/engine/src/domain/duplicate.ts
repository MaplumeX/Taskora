/**
 * 复制（Duplicate，对齐 Things 3 的 ⌘D）：把一个 Task 或 Project 整份
 * 复制成一个独立的新条目。副本是普通实体：id 全新，不记录来源（不是
 * Repeat Instance，repeatSourceId 为 null）。
 *
 * 内容照抄、状态重置（与重复项目的下一轮同一口径）：标题 / 备注 / 日期 /
 * 提醒 / 重复规则 / 归属 / 标签原样复制，副本连同其 Subtask、项目内的
 * Headings 与任务全部为未完成；附件指向同一 Blob（ADR-0019）。
 * 设备与 REST 共用。
 */

import { ProjectStatus, ScheduledType, TaskStatus, type RepeatRule } from '@taskora/shared';

import { deriveAttachmentId, deriveSubtaskId } from '../repeat';
import { resolveProjectBucket, resolveTaskBucket } from './bucket';
import { dateKeyOf, type CalendarZones } from './calendar';
import { sortByEffectivePosition } from './order';
import type { ProjectFields } from './projects';
import {
  copyAttachment,
  type RepeatAttachmentFields,
  type RepeatParentAttachment,
  type RepeatParentSubtask,
  type RepeatSubtaskFields,
} from './repeat-instance';
import {
  copyProjectContents,
  type ProjectContentsSource,
  type RepeatProjectCopy,
} from './repeat-project';
import { planReviewSchedule, type ReviewContext } from './review';
import type { TaskFields } from './tasks';

export interface DuplicateTaskSource {
  title: string;
  notes: string | null;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  reminderTime: string | null;
  /** 规范化后的规则（两端各自从存储解析）。 */
  repeatRule: RepeatRule | null;
  bucket: unknown;
  projectId: string | null;
  headingId: string | null;
  areaId: string | null;
  tagIds: readonly string[];
}

/**
 * 复制任务：副本字段与（按副本 id 生成的）Subtask / 附件。调用方先写入
 * 任务拿到副本 id，再用 subtasksFor / attachmentsFor 生成子实体；位次由
 * 调用方分配（紧跟来源任务）。
 */
export function planTaskDuplicate(
  source: DuplicateTaskSource,
  subtasks: readonly RepeatParentSubtask[],
  attachments: readonly RepeatParentAttachment[],
  zones: CalendarZones,
): {
  task: TaskFields;
  subtasksFor: (copyId: string) => RepeatSubtaskFields[];
  attachmentsFor: (copyId: string) => RepeatAttachmentFields[];
} {
  const scheduledType = (source.scheduledType as ScheduledType) ?? ScheduledType.NONE;
  const dated = scheduledType === ScheduledType.DATE;
  const ordered = sortByEffectivePosition(subtasks);
  const orderedAttachments = sortByEffectivePosition(attachments);
  return {
    task: {
      title: source.title,
      notes: source.notes,
      scheduledType,
      scheduledDate: dated ? dateKeyOf(source.scheduledDate, zones) : null,
      reminderTime: dated ? source.reminderTime : null,
      repeatRule: dated ? source.repeatRule : null,
      repeatSourceId: null,
      dueDate: dateKeyOf(source.dueDate, zones),
      bucket: resolveTaskBucket(source.bucket, scheduledType, source.projectId, source.areaId),
      status: TaskStatus.ACTIVE,
      settledAt: null,
      trashedAt: null,
      projectId: source.projectId,
      headingId: source.headingId,
      areaId: source.areaId,
      tagIds: [...source.tagIds],
    },
    subtasksFor: (copyId) =>
      ordered.map((subtask, index) => ({
        id: deriveSubtaskId(copyId, index),
        title: subtask.title,
        taskId: copyId,
        position: subtask.position ?? null,
        status: TaskStatus.ACTIVE,
        settledAt: null,
      })),
    attachmentsFor: (copyId) =>
      orderedAttachments.map((attachment, index) =>
        copyAttachment(attachment, deriveAttachmentId(copyId, index), copyId),
      ),
  };
}

export interface DuplicateProjectSource {
  title: string;
  notes: string | null;
  scheduledType: unknown;
  scheduledDate: unknown;
  dueDate: unknown;
  /** 规范化后的规则。 */
  repeatRule: RepeatRule | null;
  /** 来源的回顾间隔（存储原值，空值按账号默认）。 */
  reviewInterval: unknown;
  areaId: string | null;
  tagIds: readonly string[];
}

/**
 * 复制项目：副本字段，以及按副本 id 生成的 Headings / 任务 / Subtask /
 * 附件（规则见 copyProjectContents，日期不平移）。回顾间隔沿用，排期从
 * 今天重新计、从未回顾。位次由调用方分配（侧边栏中紧跟来源项目）。
 */
export function planProjectDuplicate(
  source: DuplicateProjectSource,
  zones: CalendarZones,
  review: ReviewContext,
): {
  project: ProjectFields;
  copyFor: (copyId: string, children: ProjectContentsSource) => RepeatProjectCopy;
} {
  const scheduledType = (source.scheduledType as ScheduledType) ?? ScheduledType.NONE;
  const dated = scheduledType === ScheduledType.DATE;
  return {
    project: {
      title: source.title,
      notes: source.notes,
      scheduledType,
      scheduledDate: dated ? dateKeyOf(source.scheduledDate, zones) : null,
      dueDate: dateKeyOf(source.dueDate, zones),
      repeatRule: dated ? source.repeatRule : null,
      repeatSourceId: null,
      ...planReviewSchedule(review, 'project', { reviewInterval: source.reviewInterval }),
      bucket: resolveProjectBucket(scheduledType),
      status: ProjectStatus.ACTIVE,
      completedAt: null,
      trashedAt: null,
      areaId: source.areaId,
      tagIds: [...source.tagIds],
    },
    copyFor: (copyId, children) => copyProjectContents(copyId, children, 0, zones),
  };
}
