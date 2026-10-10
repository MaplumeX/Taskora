/**
 * 移入时机（Logging Mode，ADR 0022）：已了结的条目是否已移入 Logbook，以及
 * 视图因此留下 / 收入哪些条目。
 */

import { describe, expect, it } from 'vitest';

import {
  loggedThroughAfterModeChange,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type LoggingPreferences,
} from '@taskora/shared';

import {
  projectMatchesView,
  settledIsLogged,
  taskMatchesQuery,
  taskMatchesView,
  type ViewContext,
} from '../src/index';

const SHANGHAI = { timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' };
// 上海 2026-10-10 10:00
const NOW = new Date('2026-10-10T02:00:00.000Z');

function contextWith(logging: LoggingPreferences | undefined): ViewContext {
  return { ...SHANGHAI, now: NOW, logging };
}

const manual = (loggedThrough: string | null = null) =>
  contextWith({ mode: 'MANUAL', loggedThrough });
const daily = (loggedThrough: string | null = null) =>
  contextWith({ mode: 'DAILY', loggedThrough });

describe('settledIsLogged', () => {
  it('立即模式（或未给出移入时机）恒为已移入', () => {
    expect(settledIsLogged('2026-10-10T01:00:00.000Z', contextWith(undefined))).toBe(true);
    expect(
      settledIsLogged(
        '2026-10-10T01:00:00.000Z',
        contextWith({ mode: 'IMMEDIATE', loggedThrough: null }),
      ),
    ).toBe(true);
  });

  it('手动模式：不晚于水位线的已移入，之后的未移入', () => {
    const context = manual('2026-10-09T12:00:00.000Z');
    expect(settledIsLogged('2026-10-09T12:00:00.000Z', context)).toBe(true);
    expect(settledIsLogged('2026-10-09T11:00:00.000Z', context)).toBe(true);
    expect(settledIsLogged('2026-10-09T12:00:00.001Z', context)).toBe(false);
    // 跨天也不移入
    expect(settledIsLogged('2026-10-09T13:00:00.000Z', manual('2026-10-09T12:00:00.000Z'))).toBe(
      false,
    );
  });

  it('每天模式：按账号时区，了结日早于今天即移入', () => {
    // 上海 10-10 00:30（UTC 10-09 16:30）是今天；上海 10-09 23:30 是昨天
    expect(settledIsLogged('2026-10-09T16:30:00.000Z', daily())).toBe(false);
    expect(settledIsLogged('2026-10-09T15:30:00.000Z', daily())).toBe(true);
  });

  it('每天模式也认水位线（提前 Log Completed）', () => {
    expect(settledIsLogged('2026-10-10T01:00:00.000Z', daily('2026-10-10T01:30:00.000Z'))).toBe(
      true,
    );
  });

  it('早于 Archived Logbook 截止时刻的一律已移入', () => {
    expect(settledIsLogged('2025-09-01T00:00:00.000Z', manual())).toBe(true);
    expect(settledIsLogged('2026-01-01T00:00:00.000Z', manual())).toBe(false);
  });

  it('了结时间缺失按已移入对待', () => {
    expect(settledIsLogged(null, manual())).toBe(true);
    expect(settledIsLogged('not-a-date', manual())).toBe(true);
  });
});

describe('loggedThroughAfterModeChange', () => {
  const now = new Date('2026-10-10T02:00:00.000Z');
  const old = '2026-10-01T00:00:00.000Z';

  it('离开立即模式、或在每天 / 手动之间切换时推进到现在', () => {
    expect(loggedThroughAfterModeChange('IMMEDIATE', 'MANUAL', null, now)).toBe(now.toISOString());
    expect(loggedThroughAfterModeChange('IMMEDIATE', 'DAILY', old, now)).toBe(now.toISOString());
    expect(loggedThroughAfterModeChange('DAILY', 'MANUAL', old, now)).toBe(now.toISOString());
    expect(loggedThroughAfterModeChange('MANUAL', 'DAILY', old, now)).toBe(now.toISOString());
  });

  it('切回立即、或模式没变时不写', () => {
    expect(loggedThroughAfterModeChange('MANUAL', 'IMMEDIATE', old, now)).toBe(old);
    expect(loggedThroughAfterModeChange('MANUAL', 'MANUAL', old, now)).toBe(old);
  });
});

describe('视图里的 Unlogged Item', () => {
  const settledToday = '2026-10-10T01:00:00.000Z';
  const task = {
    status: TaskStatus.COMPLETED,
    settledAt: settledToday,
    scheduledType: ScheduledType.DATE,
    scheduledDate: '2026-10-09',
    dueDate: '2026-10-10',
    trashedAt: null,
    bucket: TaskBucket.SCHEDULED,
  };

  it('立即模式：已了结的只在 Logbook', () => {
    const context = contextWith(undefined);
    expect(taskMatchesView(task, 'today', context)).toBe(false);
    expect(taskMatchesView(task, 'logbook', context)).toBe(true);
  });

  it('手动模式：未移入的留在原视图、不在 Logbook；Deadlines 仍只列未了结', () => {
    const context = manual('2026-10-09T00:00:00.000Z');
    expect(taskMatchesView(task, 'today', context)).toBe(true);
    expect(taskMatchesView(task, 'logbook', context)).toBe(false);
    expect(taskMatchesView(task, 'deadlines', context)).toBe(false);
    const cancelled = { ...task, status: TaskStatus.CANCELLED };
    expect(taskMatchesView(cancelled, 'today', context)).toBe(true);
  });

  it('Log Completed 之后反过来', () => {
    const context = manual('2026-10-10T01:30:00.000Z');
    expect(taskMatchesView(task, 'today', context)).toBe(false);
    expect(taskMatchesView(task, 'logbook', context)).toBe(true);
  });

  it('收纳视图（Inbox / Anytime / Someday）同样留下', () => {
    const context = manual();
    const unscheduled = { ...task, scheduledType: ScheduledType.NONE, scheduledDate: null };
    expect(taskMatchesView({ ...unscheduled, bucket: TaskBucket.INBOX }, 'inbox', context)).toBe(
      true,
    );
    expect(
      taskMatchesView({ ...unscheduled, bucket: TaskBucket.ANYTIME }, 'anytime', context),
    ).toBe(true);
    expect(
      taskMatchesView({ ...task, scheduledType: ScheduledType.SOMEDAY }, 'someday', context),
    ).toBe(true);
  });

  it('Trash 里的已了结任务不留在原视图', () => {
    expect(taskMatchesView({ ...task, trashedAt: settledToday }, 'today', manual())).toBe(false);
  });

  it('项目页 / Area 页的任务列表留下 Unlogged Item', () => {
    const row = { ...task, title: 't', notes: null, projectId: 'p1', areaId: null, tagIds: [] };
    expect(taskMatchesQuery(row, { projectId: 'p1' }, manual())).toBe(true);
    expect(taskMatchesQuery(row, { projectId: 'p1' }, contextWith(undefined))).toBe(false);
  });

  it('已完成未移入的项目留在 Today，移入后进 Logbook', () => {
    const project = {
      status: ProjectStatus.COMPLETED,
      completedAt: settledToday,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-10',
      dueDate: null,
      trashedAt: null,
    };
    expect(projectMatchesView(project, 'today', manual())).toBe(true);
    expect(projectMatchesView(project, 'logbook', manual())).toBe(false);
    expect(projectMatchesView(project, 'today', manual('2026-10-10T02:00:00.000Z'))).toBe(false);
    expect(projectMatchesView(project, 'logbook', manual('2026-10-10T02:00:00.000Z'))).toBe(true);
  });
});
