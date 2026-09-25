import { describe, expect, it } from 'vitest';

import { carouselTitle, sortStatusBarTasks, taskLine, type StatusBarTaskInput } from './content';

/** 本地时区下构造 ISO 日期（内容与比较同源，避免时区漂移）。 */
function localIso(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day).toISOString();
}

function task(title: string, scheduledDate: string | null, sortOrder = 0): StatusBarTaskInput {
  return { title, scheduledDate, sortOrder };
}

// 固定「今天」：2026-09-25 15:00 本地时间。
const NOW = new Date(2026, 8, 25, 15, 0, 0);
const TODAY = localIso(2026, 9, 25);
const YESTERDAY = localIso(2026, 9, 24);
const BEFORE = localIso(2026, 9, 20);

describe('sortStatusBarTasks', () => {
  it('按日期升序（逾期在前），同日按 sortOrder，null 兜底最后', () => {
    const sorted = sortStatusBarTasks([
      task('今天-b', TODAY, 2),
      task('无日期', null),
      task('更早', BEFORE),
      task('今天-a', TODAY, 1),
      task('昨天', YESTERDAY),
    ]);
    expect(sorted.map((t) => t.title)).toEqual(['更早', '昨天', '今天-a', '今天-b', '无日期']);
  });
});

describe('taskLine', () => {
  it('逾期带 M/d 前缀；今天与非逾期不带', () => {
    expect(taskLine(task('写报告', YESTERDAY), NOW)).toBe('9/24 · 写报告');
    expect(taskLine(task('写报告', TODAY), NOW)).toBe('写报告');
    expect(taskLine(task('写报告', null), NOW)).toBe('写报告');
  });
});

describe('carouselTitle', () => {
  const tasks = [task('逾期', YESTERDAY), task('今天一', TODAY, 1), task('今天二', TODAY, 2)];

  it('空列表返回空串', () => {
    expect(carouselTitle([], 0, NOW)).toBe('');
  });

  it('单条不带位置指示', () => {
    expect(carouselTitle([task('唯一', TODAY)], 0, NOW)).toBe('唯一');
  });

  it('多条带 (i/N) 位置指示，游标越界取模', () => {
    expect(carouselTitle(tasks, 0, NOW)).toBe('9/24 · 逾期 (1/3)');
    expect(carouselTitle(tasks, 2, NOW)).toBe('今天二 (3/3)');
    expect(carouselTitle(tasks, 3, NOW)).toBe('9/24 · 逾期 (1/3)');
    expect(carouselTitle(tasks, -1, NOW)).toBe('今天二 (3/3)');
  });
});
