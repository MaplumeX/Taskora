import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeedItem, TaskFeedItem } from '@taskora/shared';

import { i18n } from '@/i18n/config';
import { groupLogbookItems } from './logbookLayout';

function settledTask(id: string, settledAt: Date): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: 'NONE',
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    status: 'COMPLETED',
    bucket: 'LOGBOOK',
    completedAt: settledAt.toISOString(),
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    createdAt: settledAt.toISOString(),
    updatedAt: settledAt.toISOString(),
    tags: [],
  } as unknown as TaskFeedItem;
}

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(i18n.language, opts).format(date);
}

describe('groupLogbookItems（渐进粒度：近期逐日、远期收拢）', () => {
  // 固定「今天」= 2026-09-25 周五
  const NOW = new Date(2026, 8, 25, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('今天与昨天用相对词', () => {
    const groups = groupLogbookItems(
      [
        settledTask('a', new Date(2026, 8, 25, 9, 0)),
        settledTask('b', new Date(2026, 8, 24, 18, 0)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual([
      i18n.t('common:today'),
      i18n.t('task:yesterday'),
    ]);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('3 天前～本周一逐日分组，标题为星期全称', () => {
    // 2026-09-21 是周一（4 天前，仍属本周）
    const monday = new Date(2026, 8, 21, 10, 0);
    const groups = groupLogbookItems([settledTask('a', monday)], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(fmt(monday, { weekday: 'long' }));
  });

  it('本月更早（>7 天）按周分组，标题为周区间', () => {
    // 2026-09-10（15 天前，与今天同月），所在 ISO 周为 9/7（一）~ 9/13（日）
    const groups = groupLogbookItems(
      [
        settledTask('a', new Date(2026, 8, 10, 10, 0)),
        settledTask('b', new Date(2026, 8, 8, 10, 0)), // 同一周
      ],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe(
      i18n.t('task:logbookWeekRange', {
        start: fmt(new Date(2026, 8, 7), { month: 'short', day: 'numeric' }),
        end: fmt(new Date(2026, 8, 13), { month: 'short', day: 'numeric' }),
      }),
    );
    expect(groups[0].items).toHaveLength(2);
  });

  it('当年更早按月分组，标题为月份名', () => {
    const groups = groupLogbookItems(
      [settledTask('a', new Date(2026, 4, 20, 10, 0))], // 2026-05-20
      NOW,
    );
    expect(groups[0].label).toBe(fmt(new Date(2026, 4, 1), { month: 'long' }));
  });

  it('跨年按年分组', () => {
    const groups = groupLogbookItems(
      [settledTask('a', new Date(2024, 11, 30, 10, 0))], // 2024-12-30
      NOW,
    );
    expect(groups[0].label).toBe(fmt(new Date(2024, 0, 1), { year: 'numeric' }));
  });

  it('多个粒度共存时保持倒序', () => {
    const groups = groupLogbookItems(
      [
        settledTask('today', new Date(2026, 8, 25, 8, 0)),
        settledTask('week', new Date(2026, 8, 10, 8, 0)),
        settledTask('month', new Date(2026, 4, 20, 8, 0)),
        settledTask('year', new Date(2024, 11, 30, 8, 0)),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual([
      groups[0].key,
      groups[1].key,
      groups[2].key,
      groups[3].key,
    ]);
    expect(groups[0].items[0].id).toBe('today');
    expect(groups[3].items[0].id).toBe('year');
  });

  it('空 completedAt 的条目被跳过', () => {
    const item = settledTask('a', NOW);
    item.completedAt = null;
    expect(groupLogbookItems([item as FeedItem], NOW)).toEqual([]);
  });

  it('跨月周：周分组以周一为代表日、周日为区间终点', () => {
    // 今天 = 2026-09-10（周四）；上周（8/31 周一 ~ 9/6 周日）完整落在本月更早之外、按周
    const now = new Date(2026, 8, 10, 12, 0, 0);
    const groups = groupLogbookItems(
      [settledTask('a', new Date(2026, 7, 31, 10, 0))], // 上周一
      now,
    );
    expect(groups[0].label).toBe(
      i18n.t('task:logbookWeekRange', {
        start: fmt(new Date(2026, 7, 31), { month: 'short', day: 'numeric' }),
        end: fmt(new Date(2026, 8, 6), { month: 'short', day: 'numeric' }),
      }),
    );
  });

  it('今天=周六时：本周仍逐日、上周才按周', () => {
    // 今天 = 2026-09-12（周六）
    const now = new Date(2026, 8, 12, 12, 0, 0);
    const mondayThisWeek = new Date(2026, 8, 7, 10, 0); // 本周一（5 天前）
    const lastWednesday = new Date(2026, 8, 2, 10, 0); // 上周三
    const groups = groupLogbookItems(
      [settledTask('a', mondayThisWeek), settledTask('b', lastWednesday)],
      now,
    );
    expect(groups[0].label).toBe(fmt(mondayThisWeek, { weekday: 'long' })); // 逐日
    expect(groups[1].label).toBe(
      i18n.t('task:logbookWeekRange', {
        start: fmt(new Date(2026, 7, 31), { month: 'short', day: 'numeric' }),
        end: fmt(new Date(2026, 8, 6), { month: 'short', day: 'numeric' }),
      }),
    );
  });

  it('今天=周一时：紧邻的上周日仍逐日、更早已按周', () => {
    // 今天 = 2026-09-07（周一）
    const now = new Date(2026, 8, 7, 12, 0, 0);
    const sunday = new Date(2026, 8, 6, 10, 0); // 昨天（上周日，diff=1）
    const lastTuesday = new Date(2026, 8, 1, 10, 0); // 上周二
    const groups = groupLogbookItems(
      [settledTask('a', sunday), settledTask('b', lastTuesday)],
      now,
    );
    expect(groups[0].label).toBe(i18n.t('task:yesterday'));
    expect(groups[1].label).toBe(
      i18n.t('task:logbookWeekRange', {
        start: fmt(new Date(2026, 7, 31), { month: 'short', day: 'numeric' }),
        end: fmt(new Date(2026, 8, 6), { month: 'short', day: 'numeric' }),
      }),
    );
  });
});
