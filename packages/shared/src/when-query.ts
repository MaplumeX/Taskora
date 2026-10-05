import { Temporal } from '@js-temporal/polyfill';

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
}

export type WhenCandidate =
  { kind: 'date'; date: string; time?: string } | { kind: 'someday' } | { kind: 'clear' };

const MAX_CANDIDATES = 6;

type PlainDate = Temporal.PlainDate;

/** 解析中间结果：exact 为完全匹配，否则为前缀补全。 */
interface Match {
  value: PlainDate | 'someday' | 'clear';
  exact: boolean;
}

export function parseWhenQuery(query: string, options: WhenQueryOptions): WhenCandidate[] {
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

// ─── 归一化 ────────────────────────────────────────────────────────────

const CJK = '\\u3400-\\u9fff';

function normalize(query: string): string {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。、]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(new RegExp(`(?<=[${CJK}])\\s+|\\s+(?=[${CJK}])`, 'g'), '');
}

// ─── 数字 ─────────────────────────────────────────────────────────────

const ZH_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const ZH_NUM = '[零〇一二两三四五六七八九十廿卅]+';
const NUM = `(?:\\d{1,2}|${ZH_NUM})`;

/** 阿拉伯数字或一到九十九的中文数字（含「两」「廿」「卅」）。 */
function toNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (text.length === 1 && text in ZH_DIGITS) return ZH_DIGITS[text];
  const m = /^([一二三四五六七八九]?)([十廿卅])([一二三四五六七八九]?)$/.exec(text);
  if (!m) return null;
  const ones = m[3] ? ZH_DIGITS[m[3]] : 0;
  if (m[2] === '十') return (m[1] ? ZH_DIGITS[m[1]] : 1) * 10 + ones;
  if (m[1]) return null; // 「二廿」不成立
  return (m[2] === '廿' ? 20 : 30) + ones;
}

const EN_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

// ─── 时刻 ─────────────────────────────────────────────────────────────

type Period = 'am' | 'pm' | 'noon';

interface TimeResult {
  rest: string;
  time?: string;
  impliesToday?: boolean;
}

/** 正在输入、尚不完整的时刻尾巴：`at`、`9`、`9:`、`9:3`。 */
const PARTIAL_TIME_TAIL = /\s*(?:(?:\bat\s+|@\s*)?\d{1,2}(?::\d?)?|\bat|@)$/;

const ZH_PERIODS: Record<string, { period: Period; standalone: string; today?: boolean }> = {
  凌晨: { period: 'am', standalone: '' },
  早上: { period: 'am', standalone: '09:00' },
  早晨: { period: 'am', standalone: '09:00' },
  上午: { period: 'am', standalone: '09:00' },
  中午: { period: 'noon', standalone: '12:00' },
  下午: { period: 'pm', standalone: '14:00' },
  傍晚: { period: 'pm', standalone: '19:00' },
  晚上: { period: 'pm', standalone: '19:00' },
  今晚: { period: 'pm', standalone: '20:00', today: true },
};
const EN_PERIODS: Record<string, { period: Period; standalone: string; today?: boolean }> = {
  morning: { period: 'am', standalone: '09:00' },
  afternoon: { period: 'pm', standalone: '14:00' },
  evening: { period: 'pm', standalone: '19:00' },
  tonight: { period: 'pm', standalone: '20:00', today: true },
};

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 按 am / pm 修正小时；不合法返回 null。 */
function resolveHour(hour: number, minute: number, period: Period | undefined): string | null {
  if (minute < 0 || minute > 59) return null;
  if (!period) return hour <= 23 ? hhmm(hour, minute) : null;
  if (hour < 1 || hour > 12) return period === 'am' && hour === 0 ? hhmm(0, minute) : null;
  if (period === 'am') return hhmm(hour % 12, minute);
  if (period === 'noon') return hhmm(hour <= 2 ? hour + 12 : hour, minute);
  return hhmm(hour === 12 ? 12 : hour + 12, minute);
}

function extractTime(text: string): TimeResult | 'invalid' {
  const cut = (m: RegExpExecArray) =>
    (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  const periodNames = Object.keys(ZH_PERIODS).join('|');

  // 中文：[时段]N点[半|一刻|三刻|M分]
  const zh = new RegExp(`(${periodNames})?(${NUM})[点點时](半|一刻|三刻|(${NUM})分?)?`).exec(text);
  if (zh) {
    const hour = toNumber(zh[2]);
    const minute =
      zh[3] === '半'
        ? 30
        : zh[3] === '一刻'
          ? 15
          : zh[3] === '三刻'
            ? 45
            : zh[4]
              ? toNumber(zh[4])
              : 0;
    const info = zh[1] ? ZH_PERIODS[zh[1]] : undefined;
    if (hour === null || minute === null) return 'invalid';
    const time = resolveHour(hour, minute, info?.period);
    return time ? { rest: cut(zh), time, impliesToday: info?.today } : 'invalid';
  }

  // 英文 / 通用：9am、9:30pm、at 9、21:00
  const enPeriod = new RegExp(`\\b(?:this\\s+)?(${Object.keys(EN_PERIODS).join('|')})\\b`).exec(
    text,
  );
  const numeric =
    /(?:\bat\s+|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)(?![a-z])/.exec(text) ??
    /(?:\bat\s+|@\s*)(\d{1,2})(?::(\d{2}))?\b/.exec(text) ??
    /\b(\d{1,2}):(\d{2})\b/.exec(text);
  if (numeric) {
    const suffix = numeric[3]?.[0];
    const fromWord = enPeriod ? EN_PERIODS[enPeriod[1]] : undefined;
    const period: Period | undefined =
      suffix === 'a' ? 'am' : suffix === 'p' ? 'pm' : fromWord?.period;
    const time = resolveHour(Number(numeric[1]), Number(numeric[2] ?? 0), period);
    if (!time) return 'invalid';
    let rest = cut(numeric);
    if (enPeriod && !suffix) rest = rest.replace(enPeriod[0], ' ').replace(/\s+/g, ' ').trim();
    return { rest, time, impliesToday: fromWord?.today && !suffix };
  }

  const word = /\b(noon|midnight)\b/.exec(text);
  if (word) return { rest: cut(word), time: word[1] === 'noon' ? '12:00' : '00:00' };
  if (enPeriod) {
    const info = EN_PERIODS[enPeriod[1]];
    return { rest: cut(enPeriod), time: info.standalone, impliesToday: info.today };
  }

  const zhWord = new RegExp(`(午夜|${periodNames})`).exec(text);
  if (zhWord) {
    if (zhWord[1] === '午夜') return { rest: cut(zhWord), time: '00:00' };
    const info = ZH_PERIODS[zhWord[1]];
    if (info.standalone)
      return { rest: cut(zhWord), time: info.standalone, impliesToday: info.today };
  }
  return { rest: text };
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

function exactDate(year: number, month: number, day: number): PlainDate | null {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
  } catch {
    return null;
  }
}

const EN_WEEKDAYS: string[][] = [
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
  ['sunday', 'sun'],
];
const ZH_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日|天'];
const EN_MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

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
