/**
 * 复制（Duplicate）：任务与项目的整份复制——内容照抄、状态重置为未完成。
 */

import { describe, expect, it } from 'vitest';

import {
  deriveAttachmentId,
  deriveRepeatCopyId,
  deriveSubtaskId,
  planProjectDuplicate,
  planTaskDuplicate,
} from '../src/index';

const UTC = { timeZone: 'UTC', legacyDateTimeZone: 'UTC' };
const WEEKLY = { unit: 'week', interval: 1, anchor: 'scheduled' } as const;
const REVIEW = {
  today: '2026-10-05',
  defaults: {
    project: { unit: 'week', count: 1 },
    area: { unit: 'month', count: 1 },
  },
} as const;

const source = {
  title: 'Pack bags',
  notes: 'passport',
  scheduledType: 'DATE',
  scheduledDate: '2026-10-08',
  dueDate: '2026-10-09',
  reminderTime: '09:00',
  repeatRule: WEEKLY,
  bucket: 'SCHEDULED',
  projectId: 'project-1',
  headingId: 'heading-1',
  areaId: null,
  tagIds: ['tag-1'],
};

describe('复制任务', () => {
  it('照抄标题 / 备注 / 日期 / 提醒 / 规则 / 归属 / 标签，状态为未完成、不记来源', () => {
    const plan = planTaskDuplicate(source, [], [], UTC);
    expect(plan.task).toEqual({
      title: 'Pack bags',
      notes: 'passport',
      scheduledType: 'DATE',
      scheduledDate: '2026-10-08',
      reminderTime: '09:00',
      repeatRule: WEEKLY,
      repeatSourceId: null,
      dueDate: '2026-10-09',
      bucket: 'SCHEDULED',
      status: 'ACTIVE',
      settledAt: null,
      trashedAt: null,
      projectId: 'project-1',
      headingId: 'heading-1',
      areaId: null,
      tagIds: ['tag-1'],
    });
  });

  it('非 DATE 任务不带计划日期、提醒与规则；Inbox 任务留在 Inbox', () => {
    const plan = planTaskDuplicate(
      {
        ...source,
        scheduledType: 'NONE',
        bucket: 'INBOX',
        projectId: null,
        headingId: null,
      },
      [],
      [],
      UTC,
    );
    expect(plan.task).toMatchObject({
      scheduledType: 'NONE',
      scheduledDate: null,
      reminderTime: null,
      repeatRule: null,
      bucket: 'INBOX',
    });
  });

  it('Subtask 按位次复制并重置为未完成，附件指向同一 Blob', () => {
    const plan = planTaskDuplicate(
      source,
      [
        { id: 's2', title: 'Second', position: 'b0' },
        { id: 's1', title: 'First', position: 'a0' },
      ],
      [
        {
          id: 'f1',
          name: 'ticket.pdf',
          mimeType: 'application/pdf',
          size: 3,
          blobHash: 'h',
          position: 'a0',
        },
      ],
      UTC,
    );
    expect(plan.subtasksFor('copy')).toEqual([
      {
        id: deriveSubtaskId('copy', 0),
        title: 'First',
        taskId: 'copy',
        position: 'a0',
        status: 'ACTIVE',
        settledAt: null,
      },
      {
        id: deriveSubtaskId('copy', 1),
        title: 'Second',
        taskId: 'copy',
        position: 'b0',
        status: 'ACTIVE',
        settledAt: null,
      },
    ]);
    expect(plan.attachmentsFor('copy')).toEqual([
      {
        id: deriveAttachmentId('copy', 0),
        taskId: 'copy',
        name: 'ticket.pdf',
        mimeType: 'application/pdf',
        size: 3,
        blobHash: 'h',
        position: 'a0',
      },
    ]);
  });
});

describe('复制项目', () => {
  const project = {
    title: 'Trip',
    notes: null,
    scheduledType: 'SOMEDAY',
    scheduledDate: null,
    dueDate: '2026-11-01',
    repeatRule: null,
    reviewInterval: { unit: 'month', count: 1 },
    areaId: 'area-1',
    tagIds: ['tag-1'],
  };

  it('项目字段照抄，未完成、不记来源，回顾从今天重新排期', () => {
    const plan = planProjectDuplicate(project, UTC, REVIEW);
    expect(plan.project).toEqual({
      title: 'Trip',
      notes: null,
      scheduledType: 'SOMEDAY',
      scheduledDate: null,
      dueDate: '2026-11-01',
      repeatRule: null,
      repeatSourceId: null,
      reviewInterval: { unit: 'month', count: 1 },
      nextReviewDate: '2026-11-05',
      lastReviewedOn: null,
      bucket: 'SCHEDULED',
      status: 'ACTIVE',
      completedAt: null,
      trashedAt: null,
      areaId: 'area-1',
      tagIds: ['tag-1'],
    });
  });

  it('内容整份复制、日期不平移、已了结的任务重置，Trash 中的任务不复制', () => {
    const task = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      title: id,
      notes: null,
      scheduledType: 'DATE',
      scheduledDate: '2026-10-08',
      dueDate: null,
      reminderTime: null,
      repeatRule: null,
      repeatSourceId: null,
      bucket: 'SCHEDULED',
      status: 'COMPLETED',
      trashedAt: null,
      headingId: 'h1',
      areaId: null,
      tagIds: [] as string[],
      position: 'a0',
      ...overrides,
    });
    const copy = planProjectDuplicate(project, UTC, REVIEW).copyFor('copy', {
      headings: [{ id: 'h1', title: 'Before', position: 'a0' }],
      tasks: [task('t1'), task('t2', { trashedAt: '2026-10-01T00:00:00.000Z' })],
      subtasks: [],
    });
    expect(copy.headings.map((h) => h.id)).toEqual([
      deriveRepeatCopyId('copy', 'project-heading', 'h1'),
    ]);
    expect(copy.tasks).toHaveLength(1);
    expect(copy.tasks[0]).toMatchObject({
      id: deriveRepeatCopyId('copy', 'task', 't1'),
      scheduledDate: '2026-10-08',
      status: 'ACTIVE',
      settledAt: null,
      projectId: 'copy',
      headingId: deriveRepeatCopyId('copy', 'project-heading', 'h1'),
    });
  });
});
