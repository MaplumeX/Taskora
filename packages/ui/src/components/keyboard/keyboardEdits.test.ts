import { describe, expect, it } from 'vitest';
import { addCalendarDays, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { SelectionRowItem } from '@taskora/api';

import { parentRouteFor, shiftedDeadline, shiftedStart } from './keyboardEdits';

const today = '2026-10-09';

function item(fields: Partial<SelectionRowItem> = {}): SelectionRowItem {
  return {
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.INBOX,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    projectId: null,
    areaId: null,
    ...fields,
  };
}

const dated = (date: string) => item({ scheduledType: ScheduledType.DATE, scheduledDate: date });

describe('shiftedStart', () => {
  it('在原计划日期上加减', () => {
    expect(shiftedStart(dated('2026-10-20'), 1, today)?.scheduledDate).toBe('2026-10-21');
    expect(shiftedStart(dated('2026-10-20'), -7, today)?.scheduledDate).toBe('2026-10-13');
  });

  it('无计划 / Someday / 已过的日期从今天起算，结果不早于今天', () => {
    expect(shiftedStart(item(), 1, today)).toEqual({
      scheduledType: ScheduledType.DATE,
      scheduledDate: addCalendarDays(today, 1),
    });
    expect(
      shiftedStart(item({ scheduledType: ScheduledType.SOMEDAY }), 7, today)?.scheduledDate,
    ).toBe('2026-10-16');
    expect(shiftedStart(dated('2026-10-01'), 1, today)?.scheduledDate).toBe('2026-10-10');
    expect(shiftedStart(dated('2026-10-11'), -7, today)?.scheduledDate).toBe(today);
  });

  it('已是今天再往前不写入', () => {
    expect(shiftedStart(dated(today), -1, today)).toBeNull();
  });
});

describe('shiftedDeadline', () => {
  it('有截止日期的在原值上加减，可退到过去', () => {
    expect(shiftedDeadline(item({ dueDate: '2026-10-10' }), -7, today)).toEqual({
      dueDate: '2026-10-03',
    });
  });

  it('没有截止日期的从今天起算，不落到过去', () => {
    expect(shiftedDeadline(item(), 1, today)).toEqual({ dueDate: '2026-10-10' });
    expect(shiftedDeadline(item(), -1, today)).toEqual({ dueDate: today });
  });
});

describe('parentRouteFor', () => {
  it('任务：项目 → 区域 → 按计划落到视图', () => {
    expect(parentRouteFor('task', item({ projectId: 'p', areaId: 'a' }), today)).toBe(
      '/projects/p',
    );
    expect(parentRouteFor('task', item({ areaId: 'a' }), today)).toBe('/areas/a');
    expect(parentRouteFor('task', dated(today), today)).toBe('/today');
    expect(parentRouteFor('task', dated('2026-12-01'), today)).toBe('/upcoming');
    expect(parentRouteFor('task', item({ scheduledType: ScheduledType.SOMEDAY }), today)).toBe(
      '/someday',
    );
    expect(parentRouteFor('task', item({ bucket: TaskBucket.ANYTIME }), today)).toBe('/anytime');
    expect(parentRouteFor('task', item(), today)).toBe('/inbox');
  });

  it('项目：所属区域；无区域没有父列表', () => {
    expect(parentRouteFor('project', item({ areaId: 'a' }), today)).toBe('/areas/a');
    expect(parentRouteFor('project', item(), today)).toBeNull();
  });
});
