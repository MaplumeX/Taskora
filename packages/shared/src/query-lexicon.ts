import { Temporal } from '@js-temporal/polyfill';

/**
 * 自然语言输入的共享词法（When 日期输入 `when-query`、重复输入 `repeat-query`）：
 * 归一化、中英文数字、时刻提取、星期与月份名、严格日期构造。
 */

// ─── 归一化 ────────────────────────────────────────────────────────────

export const CJK = '\\u3400-\\u9fff';

export function normalize(query: string): string {
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
export const ZH_NUM = '[零〇一二两三四五六七八九十廿卅]+';
export const NUM = `(?:\\d{1,2}|${ZH_NUM})`;

/** 阿拉伯数字或一到九十九的中文数字（含「两」「廿」「卅」）。 */
export function toNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (text.length === 1 && text in ZH_DIGITS) return ZH_DIGITS[text];
  const m = /^([一二三四五六七八九]?)([十廿卅])([一二三四五六七八九]?)$/.exec(text);
  if (!m) return null;
  const ones = m[3] ? ZH_DIGITS[m[3]] : 0;
  if (m[2] === '十') return (m[1] ? ZH_DIGITS[m[1]] : 1) * 10 + ones;
  if (m[1]) return null; // 「二廿」不成立
  return (m[2] === '廿' ? 20 : 30) + ones;
}

export const EN_NUMBERS: Record<string, number> = {
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

export type Period = 'am' | 'pm' | 'noon';

export interface TimeResult {
  rest: string;
  time?: string;
  impliesToday?: boolean;
}

/** 正在输入、尚不完整的时刻尾巴：`at`、`9`、`9:`、`9:3`。 */
export const PARTIAL_TIME_TAIL = /\s*(?:(?:\bat\s+|@\s*)?\d{1,2}(?::\d?)?|\bat|@)$/;

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

export function extractTime(text: string): TimeResult | 'invalid' {
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

// ─── 名称表 ───────────────────────────────────────────────────────────

export const EN_WEEKDAYS: string[][] = [
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
  ['sunday', 'sun'],
];
export const ZH_WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日|天'];
export const EN_MONTHS = [
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

export function exactDate(year: number, month: number, day: number): Temporal.PlainDate | null {
  try {
    return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' });
  } catch {
    return null;
  }
}
