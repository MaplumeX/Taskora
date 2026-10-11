import { describe, expect, it } from 'vitest';

import { resolveProjectStart, resolveTaskStart } from './domain/start';
import { repairEntity } from './invariants';

const task = (overrides: Record<string, unknown> = {}) => ({
  start: 'INBOX',
  scheduledDate: null,
  repeatRule: null,
  reminderTime: null,
  projectId: null,
  areaId: null,
  headingId: null,
  status: 'ACTIVE',
  settledAt: null,
  ...overrides,
});

describe('repairEntity — task', () => {
  it('一致的状态返回空（包括无归属的 INBOX / ANYTIME、有日期的 ANYTIME）', () => {
    expect(repairEntity('task', task())).toEqual({});
    expect(repairEntity('task', task({ start: 'ANYTIME' }))).toEqual({});
    expect(repairEntity('task', task({ start: 'ANYTIME', projectId: 'p1' }))).toEqual({});
    expect(
      repairEntity(
        'task',
        task({
          start: 'ANYTIME',
          scheduledDate: '2026-10-01',
          reminderTime: '09:00',
          repeatRule: { unit: 'day', interval: 1 },
        }),
      ),
    ).toEqual({});
    expect(repairEntity('task', task({ start: 'SOMEDAY', areaId: 'a1' }))).toEqual({});
    expect(
      repairEntity('task', task({ status: 'COMPLETED', settledAt: '2026-09-01T00:00:00Z' })),
    ).toEqual({});
  });

  it('R1/R2：Someday 没有日期；没有日期就没有提醒、重复规则', () => {
    expect(
      repairEntity(
        'task',
        task({
          start: 'SOMEDAY',
          scheduledDate: '2026-10-01',
          reminderTime: '09:00',
          repeatRule: { unit: 'day', interval: 1 },
        }),
      ),
    ).toEqual({ scheduledDate: null, reminderTime: null, repeatRule: null });
    expect(repairEntity('task', task({ start: 'ANYTIME', reminderTime: '09:00' }))).toEqual({
      reminderTime: null,
    });
  });

  it('R3：有归属或日期的任务离开 Inbox', () => {
    expect(repairEntity('task', task({ start: 'INBOX', scheduledDate: '2026-10-01' }))).toEqual({
      start: 'ANYTIME',
    });
    expect(repairEntity('task', task({ start: 'INBOX', projectId: 'p1' }))).toEqual({
      start: 'ANYTIME',
    });
    expect(repairEntity('task', task({ start: 'INBOX', areaId: 'a1' }))).toEqual({
      start: 'ANYTIME',
    });
  });

  it('R4：分组必须属于任务所在项目；未知分组不动', () => {
    const owners: Record<string, string> = { h1: 'p1' };
    const probe = { headingProject: (id: string) => owners[id] };
    const inProject = (projectId: string, headingId: string) =>
      task({ start: 'ANYTIME', projectId, headingId });
    expect(repairEntity('task', inProject('p2', 'h1'), probe)).toEqual({ headingId: null });
    expect(repairEntity('task', inProject('p1', 'h1'), probe)).toEqual({});
    expect(repairEntity('task', inProject('p2', 'unknown'), probe)).toEqual({});
  });

  it('R5：未了结没有了结时间', () => {
    expect(repairEntity('task', task({ settledAt: '2026-09-01T00:00:00Z' }))).toEqual({
      settledAt: null,
    });
  });

  it('只看出现的字段：部分字段集不会被凭空补全', () => {
    expect(repairEntity('task', { start: 'SOMEDAY' })).toEqual({});
    expect(repairEntity('task', { start: 'INBOX', projectId: 'p1' })).toEqual({});
    expect(repairEntity('task', { title: 'x' })).toEqual({});
  });
});

describe('repairEntity — project / subtask', () => {
  it('项目：不停留在 Inbox，Someday 没有日期，重开没有完成时间', () => {
    expect(
      repairEntity('project', {
        start: 'INBOX',
        scheduledDate: null,
        status: 'ACTIVE',
        completedAt: null,
      }),
    ).toEqual({ start: 'ANYTIME' });
    expect(
      repairEntity('project', {
        start: 'SOMEDAY',
        scheduledDate: '2026-10-01',
        repeatRule: { unit: 'day', interval: 1 },
        status: 'ACTIVE',
        completedAt: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ scheduledDate: null, repeatRule: null, completedAt: null });
  });

  it('子任务：未了结没有了结时间', () => {
    expect(repairEntity('subtask', { status: 'ACTIVE', settledAt: '2026-09-01' })).toEqual({
      settledAt: null,
    });
    expect(repairEntity('subtask', { status: 'CANCELLED', settledAt: '2026-09-01' })).toEqual({});
  });
});

describe('resolveTaskStart / resolveProjectStart', () => {
  it('写入路径与合并修复同一推导', () => {
    expect(resolveTaskStart('ANYTIME', null, null, null)).toBe('ANYTIME');
    expect(resolveTaskStart('SOMEDAY', null, 'p1', null)).toBe('SOMEDAY');
    expect(resolveTaskStart(undefined, null, 'p1', null)).toBe('ANYTIME');
    expect(resolveTaskStart(undefined, '2026-10-01', null, null)).toBe('ANYTIME');
    expect(resolveTaskStart(undefined, null, null, null)).toBe('INBOX');
  });

  it('Inbox 不能有归属或日期：整理过即 Anytime', () => {
    expect(resolveTaskStart('INBOX', null, 'p1', null)).toBe('ANYTIME');
    expect(resolveTaskStart('INBOX', null, null, 'a1')).toBe('ANYTIME');
    expect(resolveTaskStart('INBOX', '2026-10-01', null, null)).toBe('ANYTIME');
    expect(resolveTaskStart('INBOX', null, null, null)).toBe('INBOX');
  });

  it('项目只有 Anytime / Someday', () => {
    expect(resolveProjectStart('INBOX')).toBe('ANYTIME');
    expect(resolveProjectStart(undefined)).toBe('ANYTIME');
    expect(resolveProjectStart('SOMEDAY')).toBe('SOMEDAY');
  });
});

describe('repairEntity — tag', () => {
  const parents: Record<string, string | null> = { b: 'a', c: 'b' };
  const probes = { tagParent: (id: string) => parents[id] };

  it('R1：改父 Tag 成环时回到顶层', () => {
    expect(repairEntity('tag', { parentId: 'c' }, probes, 'a')).toEqual({ parentId: null });
    expect(repairEntity('tag', { parentId: 'a' }, probes, 'a')).toEqual({ parentId: null });
  });

  it('不成环、顶层或不知道自身 id 时不动', () => {
    expect(repairEntity('tag', { parentId: 'a' }, probes, 'x')).toEqual({});
    expect(repairEntity('tag', { parentId: null }, probes, 'a')).toEqual({});
    expect(repairEntity('tag', { parentId: 'c' }, probes)).toEqual({});
  });
});
