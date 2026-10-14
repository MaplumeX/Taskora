import { describe, expect, it } from 'vitest';
import { nextOccurrenceDate, normalizeRepeatRule } from '@taskora/engine';
import {
  parseRepeatQuery,
  parseWhenQuery,
  type RepeatCandidate,
  type RepeatRule,
  type WhenQueryOptions,
} from '@taskora/shared';

// 2026-10-05 是周一
const base = { today: '2026-10-05', now: '10:00' };

function parse(query: string, today = base.today): RepeatCandidate[] {
  return parseRepeatQuery(query, { ...base, today });
}

/** 第一个候选的「规则 @ 第一次日期 [时刻]」摘要，便于表格断言。 */
function first(query: string, today?: string): string | undefined {
  const c = parse(query, today)[0];
  return c && describeCandidate(c);
}

function describeCandidate(c: RepeatCandidate): string {
  const r = c.rule;
  const days = r.weekdays
    ? ` w${r.weekdays.join(',')}`
    : r.monthDays
      ? ` m${r.monthDays.join(',')}`
      : '';
  const anchor = r.anchor === 'completion' ? ' after' : '';
  return `${r.unit}×${r.interval}${days}${anchor} @ ${c.date}${c.time ? ` ${c.time}` : ''}`;
}

describe('parseRepeatQuery: 规则', () => {
  it.each([
    // 天
    ['每天', 'day×1 @ 2026-10-05'],
    ['每日', 'day×1 @ 2026-10-05'],
    ['daily', 'day×1 @ 2026-10-05'],
    ['every day', 'day×1 @ 2026-10-05'],
    ['每3天', 'day×3 @ 2026-10-05'],
    ['每三天', 'day×3 @ 2026-10-05'],
    ['每隔3天', 'day×3 @ 2026-10-05'],
    ['every 3 days', 'day×3 @ 2026-10-05'],
    ['every three days', 'day×3 @ 2026-10-05'],
    // 周
    ['每周', 'week×1 @ 2026-10-05'],
    ['每星期', 'week×1 @ 2026-10-05'],
    ['weekly', 'week×1 @ 2026-10-05'],
    ['every week', 'week×1 @ 2026-10-05'],
    ['每两周', 'week×2 @ 2026-10-05'],
    ['every 2 weeks', 'week×2 @ 2026-10-05'],
    ['every other week', 'week×2 @ 2026-10-05'],
    ['每周五', 'week×1 w5 @ 2026-10-09'],
    ['每个周五', 'week×1 w5 @ 2026-10-09'],
    ['每星期五', 'week×1 w5 @ 2026-10-09'],
    ['每周日', 'week×1 w0 @ 2026-10-11'],
    ['每周天', 'week×1 w0 @ 2026-10-11'],
    ['every fri', 'week×1 w5 @ 2026-10-09'],
    ['every friday', 'week×1 w5 @ 2026-10-09'],
    ['every sunday', 'week×1 w0 @ 2026-10-11'],
    // 今天是周一：今天即第一次
    ['每周一', 'week×1 w1 @ 2026-10-05'],
    ['每周一三五', 'week×1 w1,3,5 @ 2026-10-05'],
    ['每周一、三、五', 'week×1 w1,3,5 @ 2026-10-05'],
    ['每周一和周三', 'week×1 w1,3 @ 2026-10-05'],
    ['every mon, wed and fri', 'week×1 w1,3,5 @ 2026-10-05'],
    ['every tue and thu', 'week×1 w2,4 @ 2026-10-06'],
    ['每两周周三', 'week×2 w3 @ 2026-10-07'],
    ['every 2 weeks on wed', 'week×2 w3 @ 2026-10-07'],
    ['weekly on fri', 'week×1 w5 @ 2026-10-09'],
    ['工作日', 'week×1 w1,2,3,4,5 @ 2026-10-05'],
    ['每个工作日', 'week×1 w1,2,3,4,5 @ 2026-10-05'],
    ['every weekday', 'week×1 w1,2,3,4,5 @ 2026-10-05'],
    ['weekdays', 'week×1 w1,2,3,4,5 @ 2026-10-05'],
    ['每周末', 'week×1 w0,6 @ 2026-10-10'],
    ['every weekend', 'week×1 w0,6 @ 2026-10-10'],
    // 月
    ['每月', 'month×1 @ 2026-10-05'],
    ['每个月', 'month×1 @ 2026-10-05'],
    ['monthly', 'month×1 @ 2026-10-05'],
    ['every month', 'month×1 @ 2026-10-05'],
    ['每月15号', 'month×1 m15 @ 2026-10-15'],
    ['每月15日', 'month×1 m15 @ 2026-10-15'],
    ['每月的15号', 'month×1 m15 @ 2026-10-15'],
    ['每月十五号', 'month×1 m15 @ 2026-10-15'],
    ['every month on the 15th', 'month×1 m15 @ 2026-10-15'],
    ['monthly on 15', 'month×1 m15 @ 2026-10-15'],
    ['每月5号', 'month×1 m5 @ 2026-10-05'],
    ['每月3号', 'month×1 m3 @ 2026-11-03'],
    ['每月1号和15号', 'month×1 m1,15 @ 2026-10-15'],
    ['每月1、15号', 'month×1 m1,15 @ 2026-10-15'],
    ['every month on the 1st and 15th', 'month×1 m1,15 @ 2026-10-15'],
    ['每月最后一天', 'month×1 m31 @ 2026-10-31'],
    ['每月月底', 'month×1 m31 @ 2026-10-31'],
    ['每月15号和最后一天', 'month×1 m15,31 @ 2026-10-15'],
    ['every month on the last day', 'month×1 m31 @ 2026-10-31'],
    ['end of every month', 'month×1 m31 @ 2026-10-31'],
    ['每两个月10号', 'month×2 m10 @ 2026-10-10'],
    ['every 2 months on the 10th', 'month×2 m10 @ 2026-10-10'],
    // 年
    ['每年', 'year×1 @ 2026-10-05'],
    ['yearly', 'year×1 @ 2026-10-05'],
    ['annually', 'year×1 @ 2026-10-05'],
    ['every year', 'year×1 @ 2026-10-05'],
    ['每两年', 'year×2 @ 2026-10-05'],
    ['每年3月8日', 'year×1 @ 2027-03-08'],
    ['每年十二月一号', 'year×1 @ 2026-12-01'],
    ['every year on mar 8', 'year×1 @ 2027-03-08'],
    ['every year on 8 march', 'year×1 @ 2027-03-08'],
    // 从完成日期算
    ['完成后每3天', 'day×3 after @ 2026-10-05'],
    ['完成后3天', 'day×3 after @ 2026-10-05'],
    ['完成后每两周', 'week×2 after @ 2026-10-05'],
    ['every 3 days after completion', 'day×3 after @ 2026-10-05'],
    ['3 days after completion', 'day×3 after @ 2026-10-05'],
    // 时刻
    ['每周五9点', 'week×1 w5 @ 2026-10-09 09:00'],
    ['每天早上', 'day×1 @ 2026-10-05 09:00'],
    ['every fri at 9am', 'week×1 w5 @ 2026-10-09 09:00'],
    ['9am every fri', 'week×1 w5 @ 2026-10-09 09:00'],
    ['每月1号下午3点', 'month×1 m1 @ 2026-11-01 15:00'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('短月：日子钳制到月末', () => {
    expect(first('每月31号', '2026-02-10')).toBe('month×1 m31 @ 2026-02-28');
    expect(first('每月最后一天', '2028-02-10')).toBe('month×1 m31 @ 2028-02-29');
    expect(first('每月30号', '2026-02-28')).toBe('month×1 m30 @ 2026-02-28');
    expect(first('每年2月29日')).toBe('year×1 @ 2027-02-28');
  });

  it('非重复说法、非法输入不出候选', () => {
    for (const query of [
      '',
      'friday',
      '周五',
      '明天',
      '每周八',
      '每月32号',
      '每月0号',
      'every 1000 days',
      '每天25点',
      'every blah',
      '每两个工作日',
    ]) {
      expect(parse(query), query).toEqual([]);
    }
  });
});

describe('parseRepeatQuery: 增量补全', () => {
  const all = (query: string) => parse(query).map(describeCandidate);

  it('「每」→ 天、周、月、年、工作日', () => {
    expect(all('每').slice(0, 5)).toEqual([
      'day×1 @ 2026-10-05',
      'week×1 @ 2026-10-05',
      'week×1 w1,2,3,4,5 @ 2026-10-05',
      'month×1 @ 2026-10-05',
      'year×1 @ 2026-10-05',
    ]);
  });

  it('「每周」→ 完全匹配在前，随后按日期列最近的星期几', () => {
    expect(all('每周')).toEqual([
      'week×1 @ 2026-10-05',
      'week×1 w1 @ 2026-10-05',
      'week×1 w2 @ 2026-10-06',
      'week×1 w3 @ 2026-10-07',
      'week×1 w4 @ 2026-10-08',
      'week×1 w5 @ 2026-10-09',
    ]);
  });

  it('「每月」→ 每月、每月 N 号（今天）、每月最后一天', () => {
    expect(all('每月')).toEqual([
      'month×1 @ 2026-10-05',
      'month×1 m5 @ 2026-10-05',
      'month×1 m31 @ 2026-10-31',
    ]);
  });

  it('英文前缀', () => {
    expect(all('ev').slice(0, 5)).toEqual([
      'day×1 @ 2026-10-05',
      'week×1 @ 2026-10-05',
      'week×1 w1,2,3,4,5 @ 2026-10-05',
      'month×1 @ 2026-10-05',
      'year×1 @ 2026-10-05',
    ]);
    expect(all('every f')).toEqual(['week×1 w5 @ 2026-10-09']);
    expect(all('dai')).toEqual(['day×1 @ 2026-10-05']);
  });

  it('补全带上已输入的时刻；正在输入的时刻先按去掉它的部分给候选', () => {
    expect(all('每周五 9am')).toEqual(['week×1 w5 @ 2026-10-09 09:00']);
    expect(all('every fri at 9')[0]).toBe('week×1 w5 @ 2026-10-09 09:00');
    expect(all('每周五 9')[0]).toBe('week×1 w5 @ 2026-10-09');
  });

  it('最多 6 个，按规则与日期去重', () => {
    expect(all('每').length).toBeLessThanOrEqual(6);
    const keys = all('every');
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseRepeatQuery: 与 engine 的口径一致', () => {
  const queries = [
    '每天',
    '每周五',
    '每周一三五',
    '每两周周三',
    '工作日',
    '每周末',
    '每月15号',
    '每月1号和15号',
    '每月最后一天',
    '每两个月10号',
    '每年3月8日',
    '完成后每3天',
    'every mon, wed and fri',
    'every month on the 1st and 15th',
  ];

  it.each(queries)('%s：规则已是规范形；第一次日期落在规则的出现日上', (query) => {
    const [candidate] = parse(query);
    expect(normalizeRepeatRule(candidate.rule)).toEqual(candidate.rule);
    const rule: RepeatRule = candidate.rule;
    if (rule.interval === 1 && (rule.weekdays || rule.monthDays)) {
      const dayBefore = new Date(`${candidate.date}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      expect(
        nextOccurrenceDate(rule, { scheduledDate: dayBefore.toISOString().slice(0, 10) }),
      ).toBe(candidate.date);
    }
  });
});

describe('parseWhenQuery: allowRepeat', () => {
  const options: WhenQueryOptions = {
    ...base,
    weekStartsOn: 1,
    allowSomeday: true,
    allowRepeat: true,
  };
  const kinds = (query: string, overrides: Partial<WhenQueryOptions> = {}) =>
    parseWhenQuery(query, { ...options, ...overrides }).map((c) => c.kind);

  it('以重复触发词开头时只出重复候选', () => {
    expect(new Set(kinds('每周五'))).toEqual(new Set(['repeat']));
    expect(new Set(kinds('every fri'))).toEqual(new Set(['repeat']));
    expect(new Set(kinds('完成后3天'))).toEqual(new Set(['repeat']));
    expect(parseWhenQuery('每周五 9点', options)[0]).toEqual({
      kind: 'repeat',
      rule: { unit: 'week', interval: 1, weekdays: [5], anchor: 'scheduled' },
      date: '2026-10-09',
      time: '09:00',
    });
  });

  it('普通日期说法不受影响；重复补全排在日期候选之后', () => {
    expect(kinds('fri')).toEqual(kinds('fri', { allowRepeat: false }));
    const ev = kinds('ev');
    expect(ev).toContain('repeat');
    expect(ev.indexOf('repeat')).toBeGreaterThanOrEqual(ev.lastIndexOf('date'));
    expect(ev.length).toBeLessThanOrEqual(6);
  });

  it('allowRepeat 未开时不出重复候选', () => {
    expect(kinds('每周五', { allowRepeat: false })).not.toContain('repeat');
    expect(kinds('every fri', { allowRepeat: undefined })).not.toContain('repeat');
  });
});
