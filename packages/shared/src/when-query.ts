import { Temporal } from '@js-temporal/polyfill';

import {
  EN_MONTHS,
  EN_NUMBERS,
  EN_WEEKDAYS,
  NUM,
  PARTIAL_TIME_TAIL,
  ZH_NUM,
  ZH_WEEKDAYS,
  exactDate,
  extractTime,
  normalize,
  toNumber,
} from './query-lexicon';
import { parseRepeat, type RepeatCandidate } from './repeat-query';

/**
 * When 选择器的自然语言日期输入（`.scratch/when-natural-input`）：把输入框
 * 里的文本解析为有序候选。纯函数，只在 date key 上计算（ADR 0013），today /
 * now 由调用方按账号时区传入。中英文规则同时生效，与界面语言无关；最后一个
 * 词按前缀展开，每输入一个字都能给出候选。
 */
export interface WhenQueryOptions {
  /** 账号时区的今天，YYYY-MM-DD。 */
  today: string;
  /** 账号时区的当前时刻，HH:mm——只有时刻时据此落今天或明天。 */
  now: string;
  weekStartsOn: 0 | 1;
  /** 截止日期没有 Someday。 */
  allowSomeday: boolean;
  /** 单个实体的计划日期入口才识别重复说法（`repeat-query`）。 */
  allowRepeat?: boolean;
}

export type WhenCandidate =
  | { kind: 'date'; date: string; time?: string }
  | { kind: 'someday' }
  | { kind: 'clear' }
  | RepeatCandidate;

const MAX_CANDIDATES = 6;

type PlainDate = Temporal.PlainDate;

/** 解析中间结果：exact 为完全匹配，否则为前缀补全。 */
interface Match {
  value: PlainDate | 'someday' | 'clear';
  exact: boolean;
}

export function parseWhenQuery(query: string, options: WhenQueryOptions): WhenCandidate[] {
  if (!options.allowRepeat) return parseDateQuery(query, options);
  // 重复说法（完全匹配或以「每」「every」等开头）只出重复候选；否则重复补全排在日期之后
  const repeat = parseRepeat(query, options);
  if (repeat.exclusive) return repeat.candidates;
  const dates = parseDateQuery(query, options);
  return [...dates, ...repeat.candidates].slice(0, MAX_CANDIDATES);
}

function parseDateQuery(query: string, options: WhenQueryOptions): WhenCandidate[] {
  const text = normalize(query);
  if (!text) return [];

  const extracted = extractTime(text);
  if (extracted === 'invalid') return [];
  const { time, impliesToday } = extracted;
  const rest = impliesToday && !extracted.rest ? 'today' : extracted.rest;

  const ctx = new Context(options);
  let matches: Match[];
  if (!rest) {
    if (!time) return [];
    // 只有时刻：今天；时刻已过（或正当此刻）则明天
    const date = time > options.now ? ctx.today : ctx.today.add({ days: 1 });
    matches = [{ value: date, exact: true }];
  } else {
    matches = parseDate(rest, ctx);
    // 正在输入的时刻（`tomorrow 9`、`明天 9:`）尚不完整时，先按去掉它的部分给候选
    if (matches.length === 0 && !time) {
      const trimmed = rest.replace(PARTIAL_TIME_TAIL, '').trim();
      if (trimmed && trimmed !== rest) matches = parseDate(trimmed, ctx);
    }
  }

  return rank(matches, options.allowSomeday, time);
}

function rank(matches: Match[], allowSomeday: boolean, time: string | undefined): WhenCandidate[] {
  const order = (m: Match) => (typeof m.value === 'string' ? '~' + m.value : m.value.toString());
  const sorted = matches
    .filter((m) => (m.value === 'someday' ? allowSomeday && !time : m.value !== 'clear' || !time))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || order(a).localeCompare(order(b)));

  const seen = new Set<string>();
  const out: WhenCandidate[] = [];
  for (const m of sorted) {
    const key = order(m);
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.value === 'someday' || m.value === 'clear') out.push({ kind: m.value });
    else
      out.push(
        time
          ? { kind: 'date', date: m.value.toString(), time }
          : { kind: 'date', date: m.value.toString() },
      );
    if (out.length === MAX_CANDIDATES) break;
  }
  return out;
}

// ─── 日期 ─────────────────────────────────────────────────────────────

class Context {
  readonly today: PlainDate;
  constructor(readonly options: WhenQueryOptions) {
    this.today = Temporal.PlainDate.from(options.today);
  }

  /** 本周第一天（按 weekStartsOn）。 */
  startOfWeek(): PlainDate {
    const offset = (this.today.dayOfWeek % 7) - this.options.weekStartsOn;
    return this.today.subtract({ days: (offset + 7) % 7 });
  }

  /** 今天之后最近的星期 X（1 = 周一 … 7 = 周日）。 */
  nextWeekday(weekday: number): PlainDate {
    return this.today.add({ days: (weekday - this.today.dayOfWeek + 7) % 7 || 7 });
  }

  /** 本周 / 下 n 周的星期 X。 */
  weekdayInWeek(weekday: number, weeks: number): PlainDate {
    const offset = ((weekday % 7) - this.options.weekStartsOn + 7) % 7;
    return this.startOfWeek().add({ days: offset + weeks * 7 });
  }

  /** 最近的某月某日（今天或之后），不存在的日期往后找。 */
  nearestMonthDay(month: number, day: number): PlainDate | null {
    for (let year = this.today.year; year <= this.today.year + 8; year++) {
      const date = exactDate(year, month, day);
      if (date && Temporal.PlainDate.compare(date, this.today) >= 0) return date;
    }
    return null;
  }

  /** 最近的某日（今天或之后），本月没有该日则跳到下一个有的月份。 */
  nearestDay(day: number): PlainDate | null {
    if (day < 1 || day > 31) return null;
    let month = this.today.toPlainYearMonth();
    for (let i = 0; i < 13; i++, month = month.add({ months: 1 })) {
      const date = exactDate(month.year, month.month, day);
      if (date && Temporal.PlainDate.compare(date, this.today) >= 0) return date;
    }
    return null;
  }
}

/** 关键词短语表：别名 → 日期。按前缀匹配实现增量补全。 */
function phrases(ctx: Context): Array<[aliases: string[], value: () => Match['value']]> {
  const { today } = ctx;
  const list: Array<[string[], () => Match['value']]> = [
    [['today', 'tod', 'now', '今天', '今日'], () => today],
    [['tomorrow', 'tmr', 'tmrw', 'tom', '明天', '明日'], () => today.add({ days: 1 })],
    [['day after tomorrow', '后天'], () => today.add({ days: 2 })],
    [['大后天'], () => today.add({ days: 3 })],
    [['someday', 'later', '某天', '以后', '将来', '改天'], () => 'someday'],
    [['clear', 'none', 'no date', '清除', '无', '不设'], () => 'clear'],
    [
      ['next week', '下周', '下星期', '下礼拜', '下个星期'],
      () => ctx.startOfWeek().add({ days: 7 }),
    ],
    [
      ['weekend', 'this weekend', '周末', '这周末', '本周末'],
      () => (today.dayOfWeek >= 6 ? today : ctx.nextWeekday(6)),
    ],
    [['next weekend', '下周末'], () => ctx.weekdayInWeek(6, 1)],
    [['next month', '下个月', '下月'], () => today.add({ months: 1 }).with({ day: 1 })],
    [['end of month', 'eom', '月底', '月末'], () => today.with({ day: today.daysInMonth })],
    [['next year', '明年'], () => today.with({ year: today.year + 1, month: 1, day: 1 })],
    [['end of year', 'eoy', '年底', '年末'], () => today.with({ month: 12, day: 31 })],
  ];
  EN_WEEKDAYS.forEach((names, i) => {
    const weekday = i + 1;
    list.push([names, () => ctx.nextWeekday(weekday)]);
    list.push([names.map((n) => `this ${n}`), () => thisWeekday(ctx, weekday)]);
    list.push([names.map((n) => `next ${n}`), () => ctx.weekdayInWeek(weekday, 1)]);
  });
  ZH_WEEKDAYS.forEach((chars, i) => {
    const weekday = i + 1;
    const names = chars.split('|');
    const forms = (prefixes: string[]) => prefixes.flatMap((p) => names.map((n) => p + n));
    list.push([forms(['周', '星期', '礼拜']), () => ctx.nextWeekday(weekday)]);
    list.push([forms(['这周', '本周', '这星期', '这个星期']), () => thisWeekday(ctx, weekday)]);
    list.push([
      forms(['下周', '下星期', '下个星期', '下礼拜']),
      () => ctx.weekdayInWeek(weekday, 1),
    ]);
  });
  return list;
}

/** 本周的星期 X；已过去则取最近的星期 X。 */
function thisWeekday(ctx: Context, weekday: number): PlainDate {
  const date = ctx.weekdayInWeek(weekday, 0);
  return Temporal.PlainDate.compare(date, ctx.today) >= 0 ? date : ctx.nextWeekday(weekday);
}

function parseDate(text: string, ctx: Context): Match[] {
  const matches: Match[] = [];
  for (const [aliases, value] of phrases(ctx)) {
    if (aliases.includes(text)) matches.push({ value: value(), exact: true });
    else if (aliases.some((a) => a.startsWith(text)))
      matches.push({ value: value(), exact: false });
  }
  matches.push(...parseRelative(text, ctx), ...parseAbsolute(text, ctx));
  return matches;
}

// ─── 相对日期 ──────────────────────────────────────────────────────────

type Unit = 'days' | 'weeks' | 'months' | 'years';
const EN_UNITS: Record<Unit, string[]> = {
  days: ['d', 'day', 'days'],
  weeks: ['w', 'wk', 'wks', 'week', 'weeks'],
  months: ['m', 'mo', 'mos', 'month', 'months'],
  years: ['y', 'yr', 'yrs', 'year', 'years'],
};

function shift(ctx: Context, amount: number, unit: Unit): PlainDate {
  return ctx.today.add({ [unit]: amount });
}

function parseRelative(text: string, ctx: Context): Match[] {
  if (/^\+\d{1,4}$/.test(text))
    return [{ value: shift(ctx, Number(text.slice(1)), 'days'), exact: true }];

  // in 3 days / 3d / a week / in 2
  const en = /^(in\s+)?(?:(\d{1,4})\s*|([a-z]+)\s+)([a-z]*)$/.exec(text);
  if (en) {
    const amount = en[2] ? Number(en[2]) : EN_NUMBERS[en[3]];
    const unitText = en[4];
    if (amount !== undefined && (unitText || en[1])) {
      return (Object.keys(EN_UNITS) as Unit[]).flatMap((unit): Match[] => {
        const aliases = EN_UNITS[unit];
        if (!aliases.some((a) => a.startsWith(unitText))) return [];
        return [{ value: shift(ctx, amount, unit), exact: aliases.includes(unitText) }];
      });
    }
  }

  // 3天后 / 两周后 / 一个月后 / 3个
  const zh = new RegExp(
    `^(\\d{1,4}|${ZH_NUM})(个)?(天|日|周|星期|礼拜|月|年)?(以后|之后|后)?$`,
  ).exec(text);
  if (zh) {
    const amount = toNumber(zh[1]);
    const [, , ge, unitText, after] = zh;
    if (amount === null) return [];
    const exact = !!after;
    if (!unitText) {
      if (!ge) return [];
      return [
        { value: shift(ctx, amount, 'weeks'), exact: false },
        { value: shift(ctx, amount, 'months'), exact: false },
      ];
    }
    const unit: Unit | null =
      unitText === '天'
        ? 'days'
        : unitText === '日'
          ? after
            ? 'days'
            : null // 「12日」是绝对日期
          : unitText === '月'
            ? ge
              ? 'months'
              : null // 「3月」是月份
            : unitText === '年'
              ? zh[1].length <= 2
                ? 'years'
                : null
              : 'weeks';
    if (unit) return [{ value: shift(ctx, amount, unit), exact }];
  }
  return [];
}

// ─── 绝对日期 ──────────────────────────────────────────────────────────

/** 「1」→ 1 号（完全匹配）+ 10~19 号（前缀补全）。 */
function dayCompletions(dayText: string): Array<{ day: number; exact: boolean }> {
  const day = Number(dayText);
  const out = [{ day, exact: true }];
  if (dayText.length === 1 && day >= 1 && day <= 3) {
    for (let d = day * 10; d <= Math.min(day * 10 + 9, 31); d++) out.push({ day: d, exact: false });
  }
  return out;
}

function parseAbsolute(text: string, ctx: Context): Match[] {
  const out: Match[] = [];
  const push = (date: PlainDate | null, exact: boolean) => date && out.push({ value: date, exact });

  // 2026-10-12 / 2026/10/12 / 2026年10月12日
  let m = /^(\d{4})(?:[-/.]|年)(\d{1,2})(?:[-/.]|月)(\d{1,2})[日号]?$/.exec(text);
  if (m) {
    for (const { day, exact } of dayCompletions(m[3])) push(exactDate(+m[1], +m[2], day), exact);
    return out;
  }

  // 8/12、8-12、8/12/27
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    for (const { day, exact } of dayCompletions(m[2])) {
      push(year ? exactDate(year, +m[1], day) : ctx.nearestMonthDay(+m[1], day), exact);
    }
    return out;
  }

  // 12、12th、the 12th
  m = /^(?:the\s+)?(\d{1,2})(st|nd|rd|th)?$/.exec(text);
  if (m) {
    for (const { day, exact } of m[2] ? [{ day: +m[1], exact: true }] : dayCompletions(m[1])) {
      push(ctx.nearestDay(day), exact);
    }
    return out;
  }

  // 12号、十二日
  m = new RegExp(`^(${NUM})[号日]$`).exec(text);
  if (m) {
    const day = toNumber(m[1]);
    if (day !== null) push(ctx.nearestDay(day), true);
    return out;
  }

  // 10月12日、十月十二号、10月、2027年10月
  m = new RegExp(`^(?:(\\d{4})年)?(${NUM})月(?:(${NUM})[日号]?)?$`).exec(text);
  if (m) {
    const month = toNumber(m[2]);
    if (month === null) return out;
    const days = !m[3]
      ? [{ day: 1, exact: false }]
      : /^\d$/.test(m[3])
        ? dayCompletions(m[3])
        : [{ day: toNumber(m[3]) ?? 0, exact: true }];
    for (const { day, exact } of days) {
      push(m[1] ? exactDate(+m[1], month, day) : ctx.nearestMonthDay(month, day), exact);
    }
    return out;
  }

  // aug 12、12 aug、august 12th 2027、aug
  m =
    /^(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-z]+)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?$/.exec(
      text,
    );
  if (m && !(m[1] && m[3])) {
    const name = m[2];
    const dayText = m[1] ?? m[3];
    EN_MONTHS.forEach((full, i) => {
      const exactName = name === full || (name.length >= 3 && full.startsWith(name));
      if (!full.startsWith(name)) return;
      if (dayText && !exactName) return;
      const days = dayText
        ? m![1]
          ? [{ day: +dayText, exact: true }]
          : dayCompletions(dayText)
        : [{ day: 1, exact: false }];
      for (const { day, exact } of days) {
        push(
          m![4] ? exactDate(+m![4], i + 1, day) : ctx.nearestMonthDay(i + 1, day),
          exact && exactName,
        );
      }
    });
  }
  return out;
}
