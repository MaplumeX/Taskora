import { describe, expect, it } from 'vitest';

import type { RepeatRule } from '@taskora/shared';

import {
  canonicalRepeatRule,
  deriveRepeatInstanceId,
  deriveSubtaskId,
  nextOccurrenceDate,
  normalizeRepeatRule,
} from './repeat';

/** 快捷构造（已规范形）。 */
function rule(partial: Partial<RepeatRule> & Pick<RepeatRule, 'unit'>): RepeatRule {
  return normalizeRepeatRule({ interval: 1, anchor: 'scheduled', ...partial })!;
}

describe('normalizeRepeatRule — 规范形（派生 id 的稳定输入）', () => {
  it('缺失 anchor 默认 scheduled；interval 归一为整数', () => {
    expect(rule({ unit: 'day' })).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
    expect(normalizeRepeatRule({ unit: 'day', interval: 2.0, anchor: 'scheduled' })).toEqual({
      unit: 'day',
      interval: 2,
      anchor: 'scheduled',
    });
  });

  it('weekdays 升序去重、仅 week 单位保留；空数组视为未设置', () => {
    expect(
      normalizeRepeatRule({
        unit: 'week',
        interval: 1,
        weekdays: [3, 1, 3, 0],
        anchor: 'scheduled',
      }),
    ).toEqual({ unit: 'week', interval: 1, weekdays: [0, 1, 3], anchor: 'scheduled' });
    expect(
      normalizeRepeatRule({ unit: 'week', interval: 1, weekdays: [], anchor: 'scheduled' }),
    ).toEqual({ unit: 'week', interval: 1, anchor: 'scheduled' });
    // 非 week 单位：weekdays 一律剥离（哈希输入必须稳定）
    expect(
      normalizeRepeatRule({ unit: 'day', interval: 1, weekdays: [1, 2], anchor: 'scheduled' }),
    ).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
  });

  it('until 归一为 YYYY-MM-DD；无效 until 剥离', () => {
    expect(
      normalizeRepeatRule({ unit: 'day', interval: 1, anchor: 'scheduled', until: '2026-03-01' }),
    ).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled', until: '2026-03-01' });
    // 带 ISO 时间的 until 取日期部分
    expect(
      normalizeRepeatRule({
        unit: 'day',
        interval: 1,
        anchor: 'scheduled',
        until: '2026-03-01T00:00:00.000Z',
      }),
    ).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled', until: '2026-03-01' });
    expect(
      normalizeRepeatRule({ unit: 'day', interval: 1, anchor: 'scheduled', until: 'not-a-date' }),
    ).toEqual({ unit: 'day', interval: 1, anchor: 'scheduled' });
  });

  it('非法输入返回 null：null/undefined/缺单位/interval 非正/星期越界全剔除后为空', () => {
    expect(normalizeRepeatRule(null)).toBeNull();
    expect(normalizeRepeatRule(undefined)).toBeNull();
    expect(normalizeRepeatRule({ interval: 1 })).toBeNull();
    expect(normalizeRepeatRule({ unit: 'day', interval: 0, anchor: 'scheduled' })).toBeNull();
    expect(normalizeRepeatRule({ unit: 'day', interval: -3, anchor: 'scheduled' })).toBeNull();
    expect(normalizeRepeatRule({ unit: 'day', interval: 1.5, anchor: 'scheduled' })).toBeNull();
    // 星期越界值被剔除；剔除后非空则保留合法部分
    expect(
      normalizeRepeatRule({ unit: 'week', interval: 1, weekdays: [7, 1], anchor: 'scheduled' }),
    ).toEqual({ unit: 'week', interval: 1, weekdays: [1], anchor: 'scheduled' });
    // 未知单位
    expect(normalizeRepeatRule({ unit: 'hour', interval: 1, anchor: 'scheduled' })).toBeNull();
  });

  it('interval 上限 999（防整数爆炸）', () => {
    expect(normalizeRepeatRule({ unit: 'day', interval: 1000, anchor: 'scheduled' })).toBeNull();
    expect(normalizeRepeatRule({ unit: 'day', interval: 999, anchor: 'scheduled' })).toEqual({
      unit: 'day',
      interval: 999,
      anchor: 'scheduled',
    });
  });
});

describe('nextOccurrenceDate — 规则 → 下一次出现日期（纯函数）', () => {
  it('day 单位：锚点 + N 天（含 2 天间隔）', () => {
    expect(nextOccurrenceDate(rule({ unit: 'day' }), { scheduledDate: '2026-02-01' })).toBe(
      '2026-02-02',
    );
    expect(
      nextOccurrenceDate(rule({ unit: 'day', interval: 2 }), { scheduledDate: '2026-02-01' }),
    ).toBe('2026-02-03');
  });

  it('day 单位：接受完整 ISO 时间戳输入（取 UTC 日）', () => {
    expect(
      nextOccurrenceDate(rule({ unit: 'day' }), {
        scheduledDate: '2026-02-01T08:30:00.000Z',
      }),
    ).toBe('2026-02-02');
  });

  it('本地零点旧 ISO 在账号时区恢复计划日：今天每天重复 → 明天', () => {
    const daily = rule({ unit: 'day' });
    expect(
      nextOccurrenceDate(daily, {
        scheduledDate: '2026-09-23T16:00:00.000Z',
        timeZone: 'Asia/Shanghai',
      }),
    ).toBe('2026-09-25');
    expect(
      nextOccurrenceDate(daily, {
        scheduledDate: '2026-09-24',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('2026-09-25');
    expect(
      nextOccurrenceDate(daily, {
        scheduledDate: '2026-09-24T00:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('2026-09-25');
  });

  it('完成锚点取账号时区日，不取 UTC 日', () => {
    expect(
      nextOccurrenceDate(rule({ unit: 'day', anchor: 'completion' }), {
        scheduledDate: '2026-09-24',
        settledAt: '2026-09-23T17:00:00Z',
        timeZone: 'Asia/Shanghai',
      }),
    ).toBe('2026-09-25');
    expect(
      nextOccurrenceDate(rule({ unit: 'day', anchor: 'completion' }), {
        scheduledDate: '2026-09-23',
        settledAt: '2026-09-24T02:00:00Z',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('2026-09-24');
  });

  it('week 单位无 weekdays：锚点 + N 周（同星期几）', () => {
    // 2026-02-02 是周一
    expect(nextOccurrenceDate(rule({ unit: 'week' }), { scheduledDate: '2026-02-02' })).toBe(
      '2026-02-09',
    );
    expect(
      nextOccurrenceDate(rule({ unit: 'week', interval: 2 }), { scheduledDate: '2026-02-02' }),
    ).toBe('2026-02-16');
  });

  it('week 单位带 weekdays：同周期内推进到下一个指定星期几', () => {
    // 锚点周一 2026-02-02，每周一、三：下一次是本周三 02-04
    expect(
      nextOccurrenceDate(rule({ unit: 'week', weekdays: [1, 3] }), { scheduledDate: '2026-02-02' }),
    ).toBe('2026-02-04');
    // 锚点周三 02-04：下一次是下周一 02-09
    expect(
      nextOccurrenceDate(rule({ unit: 'week', weekdays: [1, 3] }), { scheduledDate: '2026-02-04' }),
    ).toBe('2026-02-09');
  });

  it('week 单位带 weekdays：周期按锚点所在周对齐（每 2 周模式跳过非活跃周）', () => {
    // 锚点周三 2026-02-04（第 0 周），每 2 周的周一、周三：
    // 下周一 02-09 属第 1 周（非活跃）→ 跳到第 2 周周一 02-16
    expect(
      nextOccurrenceDate(rule({ unit: 'week', interval: 2, weekdays: [1, 3] }), {
        scheduledDate: '2026-02-04',
      }),
    ).toBe('2026-02-16');
    // 从 02-16（周一）继续：同周周三 02-18
    expect(
      nextOccurrenceDate(rule({ unit: 'week', interval: 2, weekdays: [1, 3] }), {
        scheduledDate: '2026-02-16',
      }),
    ).toBe('2026-02-18');
  });

  it('week 周期对齐固定为周一起始（ISO），与界面周起始偏好无关', () => {
    // 锚点周日 2026-02-08（周一为 02-02 的那周，第 0 周的周日），
    // 每 1 周的周一：下一次是 02-09（第 1 周周一）
    expect(
      nextOccurrenceDate(rule({ unit: 'week', weekdays: [1] }), { scheduledDate: '2026-02-08' }),
    ).toBe('2026-02-09');
  });

  it('month 单位：月末钳制（1-31 → 2-28；3-31 → 4-30）', () => {
    expect(nextOccurrenceDate(rule({ unit: 'month' }), { scheduledDate: '2026-01-31' })).toBe(
      '2026-02-28',
    );
    expect(nextOccurrenceDate(rule({ unit: 'month' }), { scheduledDate: '2026-03-31' })).toBe(
      '2026-04-30',
    );
    expect(
      nextOccurrenceDate(rule({ unit: 'month', interval: 2 }), { scheduledDate: '2026-01-15' }),
    ).toBe('2026-03-15');
    // 闰年：2026-12-31 + 2 月 → 2027-02-28
    expect(
      nextOccurrenceDate(rule({ unit: 'month', interval: 2 }), { scheduledDate: '2026-12-31' }),
    ).toBe('2027-02-28');
  });

  it('year 单位：2-29 闰日 → 次年 2-28', () => {
    expect(nextOccurrenceDate(rule({ unit: 'year' }), { scheduledDate: '2024-02-29' })).toBe(
      '2025-02-28',
    );
    expect(nextOccurrenceDate(rule({ unit: 'year' }), { scheduledDate: '2026-06-01' })).toBe(
      '2027-06-01',
    );
  });

  it('anchor=scheduled：从计划日期推算（固定节奏，不受实际完成时间影响）', () => {
    // 计划 02-01，拖到 02-20 才完成：下一次仍是 02-02（逾期落 Today）
    expect(
      nextOccurrenceDate(rule({ unit: 'day' }), {
        scheduledDate: '2026-02-01',
        settledAt: '2026-02-20T10:00:00.000Z',
      }),
    ).toBe('2026-02-02');
  });

  it('anchor=completion：从完成日期推算（间隔型，晚完成则顺延）', () => {
    expect(
      nextOccurrenceDate(rule({ unit: 'day', anchor: 'completion' }), {
        scheduledDate: '2026-02-01',
        settledAt: '2026-02-20T23:30:00.000Z',
      }),
    ).toBe('2026-02-21');
    // 无了结时间（不应发生）：退回计划日期
    expect(
      nextOccurrenceDate(rule({ unit: 'day', anchor: 'completion' }), {
        scheduledDate: '2026-02-01',
        settledAt: null,
      }),
    ).toBe('2026-02-02');
  });

  it('逾期结果保留计算出的日期（落 Today 由视图口径表达）', () => {
    expect(nextOccurrenceDate(rule({ unit: 'month' }), { scheduledDate: '2025-12-15' })).toBe(
      '2026-01-15',
    );
  });

  it('until：到达 until 日期（含当天）之后终止，返回 null', () => {
    // 02-02 == until → 有效；再往后终止
    expect(
      nextOccurrenceDate(rule({ unit: 'day', until: '2026-02-02' }), {
        scheduledDate: '2026-02-01',
      }),
    ).toBe('2026-02-02');
    expect(
      nextOccurrenceDate(rule({ unit: 'day', until: '2026-02-01' }), {
        scheduledDate: '2026-02-01',
      }),
    ).toBeNull();
    // 周模式跨过 until：下一次出现（02-13 周五）已过 until（02-12）→ 终止
    expect(
      nextOccurrenceDate(rule({ unit: 'week', weekdays: [5], until: '2026-02-12' }), {
        scheduledDate: '2026-02-06',
      }),
    ).toBeNull();
  });

  it('锚点日期缺失/非法 → null（规则无锚即无派生）', () => {
    expect(nextOccurrenceDate(rule({ unit: 'day' }), { scheduledDate: null })).toBeNull();
    expect(nextOccurrenceDate(rule({ unit: 'day' }), { scheduledDate: 'garbage' })).toBeNull();
  });
});

describe('确定性 id 派生（ADR-0012）', () => {
  it('同一逻辑输入（任意键序）派生同一 id；不同 occurrence/rule 派生不同 id', () => {
    const a = deriveRepeatInstanceId('task-1', rule({ unit: 'day' }), '2026-02-02');
    const aAgain = deriveRepeatInstanceId(
      'task-1',
      // 键序乱、含冗余 weekdays/until —— 规范化后哈希稳定
      normalizeRepeatRule({
        anchor: 'scheduled',
        unit: 'day',
        interval: 1,
        weekdays: [1, 2],
        until: null,
      })!,
      '2026-02-02',
    );
    expect(aAgain).toBe(a);

    expect(deriveRepeatInstanceId('task-1', rule({ unit: 'day' }), '2026-02-03')).not.toBe(a);
    expect(deriveRepeatInstanceId('task-2', rule({ unit: 'day' }), '2026-02-02')).not.toBe(a);
    expect(
      deriveRepeatInstanceId('task-1', rule({ unit: 'day', interval: 2 }), '2026-02-02'),
    ).not.toBe(a);
  });

  it('id 形如 32 位十六进制（与其余 id 同为不透明字符串）', () => {
    expect(deriveRepeatInstanceId('t', rule({ unit: 'day' }), '2026-02-02')).toMatch(
      /^[0-9a-f]{32}$/,
    );
  });

  it('subtask id 由父实例 id + 序号决定；序号不同则不同', () => {
    expect(deriveSubtaskId('instance-1', 0)).not.toBe(deriveSubtaskId('instance-1', 1));
    expect(deriveSubtaskId('instance-1', 0)).toBe(deriveSubtaskId('instance-1', 0));
    expect(deriveSubtaskId('instance-2', 0)).not.toBe(deriveSubtaskId('instance-1', 0));
  });

  it('canonicalRepeatRule：键序固定（unit,interval,weekdays?,anchor,until?）', () => {
    expect(canonicalRepeatRule(rule({ unit: 'week', weekdays: [1, 3] }))).toBe(
      '{"unit":"week","interval":1,"weekdays":[1,3],"anchor":"scheduled"}',
    );
    expect(canonicalRepeatRule(rule({ unit: 'day', until: '2026-03-01' }))).toBe(
      '{"unit":"day","interval":1,"anchor":"scheduled","until":"2026-03-01"}',
    );
  });
});
