import { Temporal } from '@js-temporal/polyfill';

import type { RepeatAnchor, RepeatRule, RepeatUnit } from './dtos/repeat-rule.dto';
import {
  EN_MONTHS,
  EN_NUMBERS,
  EN_WEEKDAYS,
  NUM,
  PARTIAL_TIME_TAIL,
  ZH_WEEKDAYS,
  exactDate,
  extractTime,
  normalize,
  toNumber,
} from './query-lexicon';

/**
 * 计划日期输入框里的重复说法（`.scratch/recurring-tasks-v3` 的 Repeat Query）：
 * 「每周五 9点」「每月1号和15号」「every 2 weeks on wed」→ 规范形 Repeat Rule
 * + 第一次出现日（今天或之后）+ 可选时刻。纯函数，只在 date key 上计算，
 * today / now 由调用方按账号时区传入；中英文规则同时生效。
 */
export interface RepeatQueryOptions {
  /** 账号时区的今天，YYYY-MM-DD。 */
  today: string;
  /** 账号时区的当前时刻，HH:mm。 */
  now: string;
}

export interface RepeatCandidate {
  kind: 'repeat';
  /** 已是规范形（与 engine normalizeRepeatRule 的输出一致）。 */
  rule: RepeatRule;
  /** 第一次出现日，YYYY-MM-DD，不早于今天。 */
  date: string;
  time?: string;
}

const MAX_CANDIDATES = 6;
const MAX_INTERVAL = 999;
const UNIT_RANK: Record<RepeatUnit, number> = { day: 0, week: 1, month: 2, year: 3 };
const WORKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

type PlainDate = Temporal.PlainDate;

/** 解析出的规则意图；year 可带第一次的月日（规则本身不存月日，锚点即第一次）。 */
interface RepeatSpec {
  unit: RepeatUnit;
  interval: number;
  weekdays?: number[];
  monthDays?: number[];
  yearDate?: { month: number; day: number };
  anchor: RepeatAnchor;
}

interface Match {
  rule: RepeatRule;
  date: string;
  exact: boolean;
  /** 0 = 通用说法（每天 / 每周…），1 = 具体说法（每周五…）；补全时通用的在前。 */
  priority: number;
}

export function parseRepeatQuery(query: string, options: RepeatQueryOptions): RepeatCandidate[] {
  return parseRepeat(query, options).candidates;
}

/**
 * 同 parseRepeatQuery，另给出 exclusive：有完全匹配或以重复触发词开头时为真，
 * parseWhenQuery 据此只出重复候选。
 */
export function parseRepeat(
  query: string,
  options: RepeatQueryOptions,
): { candidates: RepeatCandidate[]; exclusive: boolean } {
  const none = { candidates: [], exclusive: false };
  const text = normalize(query);
  if (!text) return none;

  const extracted = extractTime(text);
  if (extracted === 'invalid') return none;
  const { time } = extracted;
  let rest = extracted.rest;
  if (!rest) return none;

  const today = Temporal.PlainDate.from(options.today);
  let matches = collect(rest, today);
  // 正在输入的时刻（`每周五 9`）尚不完整时，先按去掉它的部分给候选
  if (matches.length === 0 && !time) {
    const trimmed = rest.replace(PARTIAL_TIME_TAIL, '').trim();
    if (trimmed && trimmed !== rest) {
      rest = trimmed;
      matches = collect(rest, today);
    }
  }

  return {
    candidates: rank(matches, time),
    exclusive: matches.some((m) => m.exact) || TRIGGER.test(rest),
  };
}

const TRIGGER = /^(?:每|完成后|every\b|each\b)/;

function collect(text: string, today: PlainDate): Match[] {
  const matches: Match[] = [];
  const add = (spec: RepeatSpec | null, exact: boolean, priority: number) => {
    if (spec) matches.push({ ...resolve(spec, today), exact, priority });
  };
  add(parseSpec(text), true, 0);
  for (const [phrase, priority] of completionPhrases(today)) {
    if (phrase !== text && phrase.startsWith(text)) add(parseSpec(phrase), false, priority);
  }
  return matches;
}

function rank(matches: Match[], time: string | undefined): RepeatCandidate[] {
  const sorted = matches
    .map((m, index) => ({ ...m, index }))
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.priority - b.priority ||
        UNIT_RANK[a.rule.unit] - UNIT_RANK[b.rule.unit] ||
        a.date.localeCompare(b.date) ||
        a.index - b.index,
    );
  const seen = new Set<string>();
  const out: RepeatCandidate[] = [];
  for (const m of sorted) {
    const key = `${JSON.stringify(m.rule)}@${m.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      time
        ? { kind: 'repeat', rule: m.rule, date: m.date, time }
        : { kind: 'repeat', rule: m.rule, date: m.date },
    );
    if (out.length === MAX_CANDIDATES) break;
  }
  return out;
}

/** 补全用的说法（已归一化）及优先级。 */
function completionPhrases(today: PlainDate): Array<[string, number]> {
  const generic = [
    '每天',
    '每周',
    '每个工作日',
    '每月',
    '每年',
    'every day',
    'daily',
    'every week',
    'weekly',
    'every weekday',
    'weekdays',
    'every month',
    'monthly',
    'every year',
    'yearly',
  ];
  const specific = [
    '每两周',
    '每周末',
    ...ZH_WEEKDAYS.map((chars) => `每周${chars.split('|')[0]}`),
    `每月${today.day}号`,
    '每月最后一天',
    'every other week',
    'every weekend',
    ...EN_WEEKDAYS.map((names) => `every ${names[0]}`),
    'every month on the last day',
  ];
  return [
    ...generic.map((p): [string, number] => [p, 0]),
    ...specific.map((p): [string, number] => [p, 1]),
  ];
}

// ─── 规则与第一次出现日 ────────────────────────────────────────────────

function resolve(spec: RepeatSpec, today: PlainDate): { rule: RepeatRule; date: string } {
  const sorted = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);
  // 键序同规范形：unit, interval, weekdays?, monthDays?, anchor
  const rule: RepeatRule = {
    unit: spec.unit,
    interval: spec.interval,
    ...(spec.weekdays ? { weekdays: sorted(spec.weekdays) } : {}),
    ...(spec.monthDays ? { monthDays: sorted(spec.monthDays) } : {}),
    anchor: spec.anchor,
  };
  return { rule, date: firstOccurrence(spec, today).toString() };
}

/** 今天或之后第一个命中规则日子的日期；没有日子集合时即今天。 */
function firstOccurrence(spec: RepeatSpec, today: PlainDate): PlainDate {
  if (spec.weekdays) {
    const days = new Set(spec.weekdays);
    let date = today;
    while (!days.has(date.dayOfWeek % 7)) date = date.add({ days: 1 });
    return date;
  }
  if (spec.monthDays) {
    for (let month = today.toPlainYearMonth(); ; month = month.add({ months: 1 })) {
      const dates = spec.monthDays
        .map((day) => month.toPlainDate({ day: Math.min(day, month.daysInMonth) }))
        .filter((date) => Temporal.PlainDate.compare(date, today) >= 0)
        .sort(Temporal.PlainDate.compare);
      if (dates.length > 0) return dates[0];
    }
  }
  if (spec.yearDate) {
    const { month, day } = spec.yearDate;
    for (let year = today.year; ; year++) {
      const ym = Temporal.PlainYearMonth.from({ year, month });
      const date = ym.toPlainDate({ day: Math.min(day, ym.daysInMonth) });
      if (Temporal.PlainDate.compare(date, today) >= 0) return date;
    }
  }
  return today;
}

// ─── 解析 ─────────────────────────────────────────────────────────────

function parseSpec(text: string): RepeatSpec | null {
  const spec = /[㐀-鿿]/.test(text) ? parseZh(text) : parseEn(text);
  if (!spec || spec.interval < 1 || spec.interval > MAX_INTERVAL) return null;
  return spec;
}

/** 中文：[完成后][每|每隔][N][个]（天|周…|工作日|周末|月…|年…）；单说「工作日」也算。 */
function parseZh(text: string): RepeatSpec | null {
  if (text === '工作日')
    return { unit: 'week', interval: 1, weekdays: WORKDAYS, anchor: 'scheduled' };
  const head = new RegExp(`^(?:(完成后)(?:每隔|每)?|每隔|每)(\\d{1,4}|${NUM})?个?(.+)$`).exec(text);
  if (!head) return null;
  const anchor: RepeatAnchor = head[1] ? 'completion' : 'scheduled';
  const interval = head[2] ? toNumber(head[2]) : 1;
  if (interval === null) return null;
  const body = head[3];
  const spec = (unit: RepeatUnit, extra: Partial<RepeatSpec> = {}): RepeatSpec => ({
    unit,
    interval,
    anchor,
    ...extra,
  });

  if (body === '天' || body === '日') return spec('day');
  if (body === '工作日' || body === '周末') {
    if (head[2]) return null; // 「每两个工作日」不成立
    return spec('week', { weekdays: body === '工作日' ? WORKDAYS : WEEKEND });
  }
  let m = /^(?:周|星期|礼拜)(.*)$/.exec(body);
  if (m) {
    if (!m[1]) return spec('week');
    const weekdays = zhWeekdays(m[1]);
    return weekdays ? spec('week', { weekdays }) : null;
  }
  m = /^月(?:的)?(.*)$/.exec(body);
  if (m) {
    if (!m[1]) return spec('month');
    const monthDays = zhMonthDays(m[1]);
    return monthDays ? spec('month', { monthDays }) : null;
  }
  m = /^年(?:的)?(.*)$/.exec(body);
  if (m) {
    if (!m[1]) return spec('year');
    const date = new RegExp(`^(${NUM})月(${NUM})[日号]?$`).exec(m[1]);
    const month = date && toNumber(date[1]);
    const day = date && toNumber(date[2]);
    if (!month || !day || !validMonthDay(month, day)) return null;
    return spec('year', { yearDate: { month, day } });
  }
  return null;
}

/** 「一三五」「一和周三」「日」→ 0–6（0 = 周日）。 */
function zhWeekdays(text: string): number[] | null {
  const chars = text.replace(/和|与|及|跟|周|星期|礼拜/g, '');
  if (!chars) return null;
  const out: number[] = [];
  for (const char of chars) {
    const index = ZH_WEEKDAYS.findIndex((names) => names.split('|').includes(char));
    if (index < 0) return null;
    out.push((index + 1) % 7);
  }
  return out;
}

/** 「15号」「1号和15号」「1 15号」「最后一天」→ 1–31（31 = 月末）。 */
function zhMonthDays(text: string): number[] | null {
  const parts = text
    .replace(/最后一天|月底|月末/g, ' 31 ')
    .split(/[和与及\s]+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const part of parts) {
    const day = toNumber(part.replace(/[号日]$/, ''));
    if (day === null || day < 1 || day > 31) return null;
    out.push(day);
  }
  return out;
}

const EN_UNIT_WORDS: Record<RepeatUnit, string[]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks', 'wk', 'wks'],
  month: ['month', 'months', 'mo', 'mos'],
  year: ['year', 'years', 'yr', 'yrs'],
};
const EN_ADVERBS: Record<string, RepeatUnit> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
  annually: 'year',
};

const EN_UNIT_PATTERN = Object.values(EN_UNIT_WORDS).flat().join('|');

function enUnit(word: string): RepeatUnit {
  return (Object.keys(EN_UNIT_WORDS) as RepeatUnit[]).find((u) => EN_UNIT_WORDS[u].includes(word))!;
}

function enNumber(word: string | undefined): number | null {
  if (word === undefined) return 1;
  if (/^\d+$/.test(word)) return Number(word);
  if (word === 'other') return 2;
  return EN_NUMBERS[word] ?? null;
}

/**
 * 英文：daily / weekly…[on …]、every|each [N|other] unit [on …]、every weekday /
 * weekend、every mon, wed and fri、end of every month；末尾 after completion
 * 改锚点（此时也接受不带 every 的「3 days after completion」）。
 */
function parseEn(text: string): RepeatSpec | null {
  let anchor: RepeatAnchor = 'scheduled';
  let s = text;
  const after = /\s+after\s+(?:completion|completing|done|finishing)$/.exec(s);
  if (after) {
    anchor = 'completion';
    s = s.slice(0, after.index);
  }

  if (s === 'weekdays') return { unit: 'week', interval: 1, weekdays: WORKDAYS, anchor };
  if (/^end of (?:every|each) month$/.test(s))
    return { unit: 'month', interval: 1, monthDays: [31], anchor };

  let m = /^(daily|weekly|monthly|yearly|annually)(?:\s+on\s+(.+))?$/.exec(s);
  if (m) return withQualifier(EN_ADVERBS[m[1]], 1, m[2], anchor);

  m = /^(?:every|each)\s+(.+)$/.exec(s);
  const body = m ? m[1] : anchor === 'completion' ? s : null;
  if (body === null) return null;

  if (m && /^(?:weekday|weekdays|workday|workdays)$/.test(body))
    return { unit: 'week', interval: 1, weekdays: WORKDAYS, anchor };
  if (m && /^(?:weekend|weekends)$/.test(body))
    return { unit: 'week', interval: 1, weekdays: WEEKEND, anchor };
  const weekdays = m ? enWeekdays(body) : null;
  if (weekdays) return { unit: 'week', interval: 1, weekdays, anchor };

  const unit = new RegExp(
    `^(?:(\\d{1,4}|[a-z]+)\\s+)?(${EN_UNIT_PATTERN})(?:\\s+on\\s+(.+))?$`,
  ).exec(body);
  const interval = unit && enNumber(unit[1]);
  if (!unit || interval === null) return null;
  return withQualifier(enUnit(unit[2]), interval, unit[3], anchor);
}

/** 「on …」限定：week 为星期几，month 为几号，year 为月日；day 不接受。 */
function withQualifier(
  unit: RepeatUnit,
  interval: number,
  qualifier: string | undefined,
  anchor: RepeatAnchor,
): RepeatSpec | null {
  const spec: RepeatSpec = { unit, interval, anchor };
  if (!qualifier) return spec;
  if (unit === 'week') {
    const weekdays = enWeekdays(qualifier);
    return weekdays ? { ...spec, weekdays } : null;
  }
  if (unit === 'month') {
    const monthDays = enMonthDays(qualifier);
    return monthDays ? { ...spec, monthDays } : null;
  }
  if (unit === 'year') {
    const yearDate = enMonthDay(qualifier);
    return yearDate ? { ...spec, yearDate } : null;
  }
  return null;
}

const LIST_SEPARATOR = /\s*(?:,|&|\/|\band\b)\s*|\s+/;

/** 「mon, wed and fri」「tuesdays」→ 0–6。 */
function enWeekdays(text: string): number[] | null {
  const words = text.split(LIST_SEPARATOR).filter(Boolean);
  if (words.length === 0) return null;
  const out: number[] = [];
  for (const word of words) {
    const name = word.replace(/s$/, '');
    const index = EN_WEEKDAYS.findIndex((names) => names.includes(word) || names.includes(name));
    if (index < 0) return null;
    out.push((index + 1) % 7);
  }
  return out;
}

/** 「the 1st and 15th」「15」「day 1 and 15」「the last day」→ 1–31（31 = 月末）。 */
function enMonthDays(text: string): number[] | null {
  const words = text
    .split(LIST_SEPARATOR)
    .filter((w) => w && w !== 'the' && w !== 'day' && w !== 'days');
  if (words.length === 0) return null;
  const out: number[] = [];
  for (const word of words) {
    if (word === 'last') {
      out.push(31);
      continue;
    }
    const m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(word);
    const day = m ? Number(m[1]) : NaN;
    if (!(day >= 1 && day <= 31)) return null;
    out.push(day);
  }
  return out;
}

/** 「mar 8」「march 8th」「8 march」「the 8th of march」→ 月日。 */
function enMonthDay(text: string): { month: number; day: number } | null {
  const m =
    /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(text) ??
    /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)$/.exec(text);
  if (!m) return null;
  const [name, dayText] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const index = EN_MONTHS.findIndex(
    (full) => full === name || (name.length >= 3 && full.startsWith(name)),
  );
  const day = Number(dayText);
  if (index < 0 || !validMonthDay(index + 1, day)) return null;
  return { month: index + 1, day };
}

/** 月日在某个年份存在（2/29 算存在）。 */
function validMonthDay(month: number, day: number): boolean {
  return exactDate(2028, month, day) !== null;
}
