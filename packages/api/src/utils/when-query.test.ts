import { describe, expect, it } from 'vitest';
import { parseWhenQuery, type WhenQueryOptions } from '@taskora/shared';

// 2026-10-05 是周一
const base: WhenQueryOptions = {
  today: '2026-10-05',
  now: '10:00',
  weekStartsOn: 1,
  allowSomeday: true,
};

function dates(query: string, options: Partial<WhenQueryOptions> = {}): string[] {
  return parseWhenQuery(query, { ...base, ...options }).map((c) =>
    c.kind === 'date' ? (c.time ? `${c.date} ${c.time}` : c.date) : c.kind,
  );
}
const first = (query: string, options: Partial<WhenQueryOptions> = {}) => dates(query, options)[0];

describe('parseWhenQuery: 关键词', () => {
  it.each([
    ['today', '2026-10-05'],
    ['今天', '2026-10-05'],
    ['tomorrow', '2026-10-06'],
    ['tmr', '2026-10-06'],
    ['明天', '2026-10-06'],
    ['后天', '2026-10-07'],
    ['day after tomorrow', '2026-10-07'],
    ['大后天', '2026-10-08'],
    ['someday', 'someday'],
    ['某天', 'someday'],
    ['clear', 'clear'],
    ['清除', 'clear'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('大小写、全角与多余空格', () => {
    expect(first('  ToMoRRoW ')).toBe('2026-10-06');
    expect(first('１２')).toBe('2026-10-12');
    expect(first('下周 五')).toBe('2026-10-16');
  });

  it('截止日期不出现 Someday', () => {
    expect(dates('someday', { allowSomeday: false })).toEqual([]);
    expect(dates('清除', { allowSomeday: false })).toEqual(['clear']);
  });

  it('空输入与无法识别', () => {
    expect(dates('')).toEqual([]);
    expect(dates('   ')).toEqual([]);
    expect(dates('xyz')).toEqual([]);
  });
});

describe('parseWhenQuery: 星期', () => {
  it.each([
    ['fri', '2026-10-09'],
    ['friday', '2026-10-09'],
    ['周五', '2026-10-09'],
    ['星期五', '2026-10-09'],
    ['礼拜五', '2026-10-09'],
    ['周日', '2026-10-11'],
    ['星期天', '2026-10-11'],
    // 今天是周一：单独的星期几取今天之后
    ['mon', '2026-10-12'],
    ['this fri', '2026-10-09'],
    ['这周五', '2026-10-09'],
    ['this mon', '2026-10-05'],
    ['next fri', '2026-10-16'],
    ['下周五', '2026-10-16'],
    ['next sun', '2026-10-18'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('周日为一周第一天', () => {
    const sunday = { weekStartsOn: 0 as const };
    // 本周从 10-04（周日）开始，「这周日」已过 → 最近的周日
    expect(first('this sun', sunday)).toBe('2026-10-11');
    expect(first('next sun', sunday)).toBe('2026-10-11');
    expect(first('next fri', sunday)).toBe('2026-10-16');
    expect(first('next week', sunday)).toBe('2026-10-11');
  });
});

describe('parseWhenQuery: 相对日期', () => {
  it.each([
    ['in 3 days', '2026-10-08'],
    ['3d', '2026-10-08'],
    ['3 days', '2026-10-08'],
    ['+3', '2026-10-08'],
    ['3天后', '2026-10-08'],
    ['三天后', '2026-10-08'],
    ['3日后', '2026-10-08'],
    ['in 2 weeks', '2026-10-19'],
    ['2w', '2026-10-19'],
    ['两周后', '2026-10-19'],
    ['两个星期后', '2026-10-19'],
    ['a week', '2026-10-12'],
    ['in 1 month', '2026-11-05'],
    ['一个月后', '2026-11-05'],
    ['in 1 year', '2027-10-05'],
    ['一年后', '2027-10-05'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('月末收敛', () => {
    expect(first('in 1 month', { today: '2027-01-31' })).toBe('2027-02-28');
    expect(first('1y', { today: '2028-02-29' })).toBe('2029-02-28');
  });

  it('只写数量时列出可能的单位', () => {
    expect(dates('in 3')).toEqual(['2026-10-08', '2026-10-26', '2027-01-05', '2029-10-05']);
    expect(dates('3个')).toEqual(['2026-10-26', '2027-01-05']);
  });
});

describe('parseWhenQuery: 模糊表达', () => {
  it.each([
    ['next week', '2026-10-12'],
    ['下周', '2026-10-12'],
    ['weekend', '2026-10-10'],
    ['周末', '2026-10-10'],
    ['next weekend', '2026-10-17'],
    ['下周末', '2026-10-17'],
    ['next month', '2026-11-01'],
    ['下个月', '2026-11-01'],
    ['end of month', '2026-10-31'],
    ['月底', '2026-10-31'],
    ['next year', '2027-01-01'],
    ['明年', '2027-01-01'],
    ['end of year', '2026-12-31'],
    ['年底', '2026-12-31'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('周末当天就是周末', () => {
    expect(first('weekend', { today: '2026-10-10' })).toBe('2026-10-10');
    expect(first('weekend', { today: '2026-10-11' })).toBe('2026-10-11');
  });
});

describe('parseWhenQuery: 绝对日期', () => {
  it.each([
    ['12', '2026-10-12'],
    ['12th', '2026-10-12'],
    ['the 12th', '2026-10-12'],
    ['12号', '2026-10-12'],
    ['十二日', '2026-10-12'],
    // 已过的日子落到下个月
    ['3', '2026-11-03'],
    ['5', '2026-10-05'],
    ['oct 12', '2026-10-12'],
    ['12 oct', '2026-10-12'],
    ['october 12th', '2026-10-12'],
    ['aug 12', '2027-08-12'],
    ['8/12', '2027-08-12'],
    ['8-12', '2027-08-12'],
    ['8/12/28', '2028-08-12'],
    ['aug 12 2028', '2028-08-12'],
    ['2026-10-12', '2026-10-12'],
    ['2026/10/12', '2026-10-12'],
    ['2026-01-01', '2026-01-01'],
    ['10月12日', '2026-10-12'],
    ['10月12号', '2026-10-12'],
    ['十月十二号', '2026-10-12'],
    ['八月十二', '2027-08-12'],
    ['廿一号', '2026-10-21'],
    ['卅一号', '2026-10-31'],
    ['2026年10月12日', '2026-10-12'],
    ['feb 29', '2028-02-29'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('本月没有的日子跳到下一个有的月份', () => {
    expect(first('31', { today: '2026-11-05' })).toBe('2026-12-31');
  });

  it('不存在的日期没有候选', () => {
    expect(dates('2026-02-30')).toEqual([]);
    expect(dates('13/1')).toEqual([]);
    expect(dates('32')).toEqual([]);
  });
});

describe('parseWhenQuery: 增量补全', () => {
  it('完全匹配在前，前缀补全按日期', () => {
    expect(dates('1')).toEqual([
      '2026-11-01',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(dates('tom')).toEqual(['2026-10-06']);
    expect(dates('f')).toEqual(['2026-10-09', '2027-02-01']);
    expect(dates('明')).toEqual(['2026-10-06', '2027-01-01']);
    expect(dates('下')).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
    ]);
    expect(dates('so')).toEqual(['someday']);
  });

  it('月份名前缀', () => {
    expect(dates('ma')).toEqual(['2027-03-01', '2027-05-01']);
    expect(dates('oct 1')).toEqual([
      '2027-10-01',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
    expect(dates('10月')).toEqual(['2027-10-01']);
    expect(dates('10月1')[0]).toBe('2027-10-01');
  });

  it('最多 6 个且按日期去重', () => {
    const result = dates('t');
    expect(result).toHaveLength(6);
    expect(new Set(result).size).toBe(6);
  });
});

describe('parseWhenQuery: 时刻', () => {
  it.each([
    ['明天 9点', '2026-10-06 09:00'],
    ['明天9点', '2026-10-06 09:00'],
    ['明天下午3点', '2026-10-06 15:00'],
    ['明天晚上8点半', '2026-10-06 20:30'],
    ['明天上午九点一刻', '2026-10-06 09:15'],
    ['明天9点三刻', '2026-10-06 09:45'],
    ['明天9点20分', '2026-10-06 09:20'],
    ['明天中午', '2026-10-06 12:00'],
    ['明天中午1点', '2026-10-06 13:00'],
    ['fri 3pm', '2026-10-09 15:00'],
    ['3pm fri', '2026-10-09 15:00'],
    ['fri 3 p.m.', '2026-10-09 15:00'],
    ['tomorrow 9:30', '2026-10-06 09:30'],
    ['tomorrow 9:30pm', '2026-10-06 21:30'],
    ['tomorrow 21:00', '2026-10-06 21:00'],
    ['tomorrow at 9', '2026-10-06 09:00'],
    ['tomorrow 12am', '2026-10-06 00:00'],
    ['tomorrow 12pm', '2026-10-06 12:00'],
    ['tomorrow noon', '2026-10-06 12:00'],
    ['tomorrow evening', '2026-10-06 19:00'],
    ['tomorrow evening at 8', '2026-10-06 20:00'],
    ['tomorrow morning', '2026-10-06 09:00'],
    ['aug 12 9am', '2027-08-12 09:00'],
  ])('%s', (query, expected) => {
    expect(first(query)).toBe(expected);
  });

  it('只有时刻：未过落今天，已过落明天', () => {
    expect(first('3pm')).toBe('2026-10-05 15:00');
    expect(first('下午3点')).toBe('2026-10-05 15:00');
    expect(first('9am')).toBe('2026-10-06 09:00');
    expect(first('9点半')).toBe('2026-10-06 09:30');
    expect(first('10:00')).toBe('2026-10-06 10:00');
    expect(first('noon')).toBe('2026-10-05 12:00');
    expect(first('midnight')).toBe('2026-10-06 00:00');
    expect(first('tonight')).toBe('2026-10-05 20:00');
    expect(first('今晚')).toBe('2026-10-05 20:00');
    expect(first('今晚9点')).toBe('2026-10-05 21:00');
    expect(first('this evening')).toBe('2026-10-05 19:00');
  });

  it('裸数字是日期不是时刻', () => {
    expect(dates('12')[0]).toBe('2026-10-12');
  });

  it('正在输入的时刻先给出日期', () => {
    expect(dates('tomorrow 9')).toEqual(['2026-10-06']);
    expect(dates('tomorrow 9:')).toEqual(['2026-10-06']);
    expect(dates('tomorrow at')).toEqual(['2026-10-06']);
    expect(dates('明天 9')).toEqual(['2026-10-06']);
  });

  it('时刻不合法时没有候选', () => {
    expect(dates('tomorrow 25:00')).toEqual([]);
    expect(dates('下午15点')).toEqual([]);
    expect(dates('15pm')).toEqual([]);
    expect(dates('tomorrow 9:75')).toEqual([]);
  });

  it('带时刻时不出现 Someday / 清除', () => {
    expect(dates('someday 9am')).toEqual([]);
    expect(dates('clear 9am')).toEqual([]);
  });
});
