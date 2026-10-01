import { describe, expect, it } from 'vitest';

import { resolveTaskBucket } from './domain/bucket';
import { repairEntity } from './invariants';

const task = (overrides: Record<string, unknown> = {}) => ({
  scheduledType: 'NONE',
  scheduledDate: null,
  repeatRule: null,
  reminderTime: null,
  bucket: 'INBOX',
  projectId: null,
  areaId: null,
  headingId: null,
  status: 'ACTIVE',
  settledAt: null,
  ...overrides,
});

describe('repairEntity — task', () => {
  it('一致的状态返回空（包括 NONE 下的 INBOX / ANYTIME、DATE 无日期）', () => {
    expect(repairEntity('task', task())).toEqual({});
    expect(repairEntity('task', task({ bucket: 'ANYTIME' }))).toEqual({});
    expect(repairEntity('task', task({ bucket: 'ANYTIME', projectId: 'p1' }))).toEqual({});
    expect(
      repairEntity(
        'task',
        task({
          scheduledType: 'DATE',
          scheduledDate: '2026-10-01',
          bucket: 'SCHEDULED',
          reminderTime: '09:00',
          repeatRule: { unit: 'day', interval: 1 },
        }),
      ),
    ).toEqual({});
    expect(repairEntity('task', task({ scheduledType: 'DATE', bucket: 'SCHEDULED' }))).toEqual({});
    expect(
      repairEntity('task', task({ status: 'COMPLETED', settledAt: '2026-09-01T00:00:00Z' })),
    ).toEqual({});
  });

  it('R1/R2：离开 DATE 清空提醒、重复规则；NONE/SOMEDAY 没有日期', () => {
    expect(
      repairEntity(
        'task',
        task({
          scheduledType: 'SOMEDAY',
          bucket: 'SCHEDULED',
          scheduledDate: '2026-10-01',
          reminderTime: '09:00',
          repeatRule: { unit: 'day', interval: 1 },
        }),
      ),
    ).toEqual({ scheduledDate: null, reminderTime: null, repeatRule: null });
  });

  it('R3：Bucket 与计划类型一致', () => {
    expect(
      repairEntity(
        'task',
        task({ scheduledType: 'DATE', scheduledDate: '2026-10-01', bucket: 'ANYTIME' }),
      ),
    ).toEqual({ bucket: 'SCHEDULED' });
    expect(repairEntity('task', task({ bucket: 'SCHEDULED' }))).toEqual({ bucket: 'INBOX' });
    expect(repairEntity('task', task({ bucket: 'INBOX', projectId: 'p1' }))).toEqual({
      bucket: 'ANYTIME',
    });
    expect(repairEntity('task', task({ bucket: 'SCHEDULED', areaId: 'a1' }))).toEqual({
      bucket: 'ANYTIME',
    });
  });

  it('R4：分组必须属于任务所在项目；未知分组不动', () => {
    const owners: Record<string, string> = { h1: 'p1' };
    const probe = (id: string) => owners[id];
    const inProject = (projectId: string, headingId: string) =>
      task({ bucket: 'ANYTIME', projectId, headingId });
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
    expect(repairEntity('task', { scheduledType: 'SOMEDAY' })).toEqual({});
    expect(repairEntity('task', { title: 'x' })).toEqual({});
  });
});

describe('repairEntity — project / subtask', () => {
  it('项目：NONE 下只能在 Anytime，DATE/SOMEDAY 在 Scheduled，重开没有完成时间', () => {
    expect(
      repairEntity('project', {
        scheduledType: 'NONE',
        scheduledDate: null,
        bucket: 'INBOX',
        status: 'ACTIVE',
        completedAt: null,
      }),
    ).toEqual({ bucket: 'ANYTIME' });
    expect(
      repairEntity('project', {
        scheduledType: 'SOMEDAY',
        scheduledDate: '2026-10-01',
        bucket: 'ANYTIME',
        status: 'ACTIVE',
        completedAt: '2026-09-01T00:00:00Z',
      }),
    ).toEqual({ scheduledDate: null, bucket: 'SCHEDULED', completedAt: null });
  });

  it('子任务：未了结没有了结时间', () => {
    expect(repairEntity('subtask', { status: 'ACTIVE', settledAt: '2026-09-01' })).toEqual({
      settledAt: null,
    });
    expect(repairEntity('subtask', { status: 'CANCELLED', settledAt: '2026-09-01' })).toEqual({});
  });
});

describe('resolveTaskBucket', () => {
  it('写入路径与合并修复同一推导', () => {
    expect(resolveTaskBucket('INBOX', 'DATE', null, null)).toBe('SCHEDULED');
    expect(resolveTaskBucket('ANYTIME', 'NONE', null, null)).toBe('ANYTIME');
    expect(resolveTaskBucket(undefined, 'NONE', 'p1', null)).toBe('ANYTIME');
    expect(resolveTaskBucket(undefined, 'NONE', null, null)).toBe('INBOX');
  });

  it('Inbox 不能有归属：有项目 / 区域即离开 Inbox', () => {
    expect(resolveTaskBucket('INBOX', 'NONE', 'p1', null)).toBe('ANYTIME');
    expect(resolveTaskBucket('INBOX', 'NONE', null, 'a1')).toBe('ANYTIME');
    expect(resolveTaskBucket('INBOX', 'NONE', null, null)).toBe('INBOX');
    expect(resolveTaskBucket('INBOX', 'SOMEDAY', 'p1', null)).toBe('SCHEDULED');
  });
});
