/**
 * Repeat Rule 纯函数 — 规范化、下一次出现日期与确定性 id 派生
 * （recurring-tasks spec / ADR-0012）。
 *
 * 一切与重复任务相关的计算都是纯函数：不触库、不触时钟、可跨端复用
 * （Engine 设备侧派生、REST hub 侧派生共用同一实现，保证两端派生出
 * 同一逻辑实例的同一 id）。日期以日历日期（YYYY-MM-DD）参与运算；
 * 旧 ISO 计划日期及完成时刻先按显式账号时区解码，与运行设备时区无关
 * （ADR-0013）。
 *
 * 周模式的周期对齐固定为「周一起始」（ISO 周），与界面周起始偏好无关：
 * 周起始是展示偏好，混入规则语义会让不同偏好的设备派生出不同 id。
 */

import { calendarDateKey, instantDateKey, type RepeatRule, type RepeatUnit } from '@taskora/shared';

/** interval 上限：防整周搜索循环爆炸（Things 也无超长间隔）。 */
const MAX_INTERVAL = 999;

const UNITS: ReadonlySet<RepeatUnit> = new Set(['day', 'week', 'month', 'year']);

// ---------- 规范化 ----------

/**
 * 规则 → 规范形；非法输入返回 null。
 *
 * 规范形契约（哈希稳定性的前提）：
 * - unit ∈ {day, week, month, year}；
 * - interval 为 ≥1 的整数；
 * - weekdays 仅在 unit=week 且非空时存在，升序去重、值域 0-6（0=周日）；
 * - anchor 恒存在（缺失默认 scheduled）；
 * - until 仅在合法日期时存在，归一为 YYYY-MM-DD。
 */
export function normalizeRepeatRule(input: unknown): RepeatRule | null {
  if (input == null || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;

  const unit = raw.unit;
  if (typeof unit !== 'string' || !UNITS.has(unit as RepeatUnit)) return null;

  const interval = raw.interval;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) return null;
  if (interval > MAX_INTERVAL) return null;

  const anchor =
    raw.anchor === 'completion' ? 'completion' : raw.anchor === 'scheduled' ? 'scheduled' : null;
  if (anchor === null) return null;

  const rule: RepeatRule = { unit: unit as RepeatUnit, interval, anchor };

  if (unit === 'week' && Array.isArray(raw.weekdays)) {
    const weekdays = [
      ...new Set(
        raw.weekdays.filter(
          (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
        ),
      ),
    ].sort((a, b) => a - b);
    if (weekdays.length > 0) rule.weekdays = weekdays;
  }

  if (typeof raw.until === 'string') {
    const until = dayKey(raw.until);
    if (until !== null) rule.until = until;
  }

  return rule;
}

/** 规则的规范序列化（键序固定）。哈希前必须经此函数。 */
export function canonicalRepeatRule(rule: RepeatRule): string {
  const normalized = normalizeRepeatRule(rule);
  if (normalized === null) throw new Error('canonicalRepeatRule: 非法规则');
  // 键序即构造序：unit, interval, weekdays?, anchor, until?
  const parts: string[] = [
    `"unit":${JSON.stringify(normalized.unit)}`,
    `"interval":${normalized.interval}`,
  ];
  if (normalized.weekdays) parts.push(`"weekdays":${JSON.stringify(normalized.weekdays)}`);
  parts.push(`"anchor":${JSON.stringify(normalized.anchor)}`);
  if (normalized.until) parts.push(`"until":${JSON.stringify(normalized.until)}`);
  return `{${parts.join(',')}}`;
}

// ---------- 日期运算（UTC 日） ----------

/** 任意日期串（YYYY-MM-DD 或完整 ISO）→ UTC 日键；非法返回 null。 */
function dayKey(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** UTC 日键 → Date（UTC 零点），便于统一用 getUTC* 运算。 */
function utcDate(key: string): Date | null {
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** 加 N 个月，日溢出钳制到目标月末日（1-31 + 1M → 2-28）。 */
function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const total = year * 12 + month + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12;
  return new Date(
    Date.UTC(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth))),
  );
}

/** 自 date 起的第 N 天（UTC）。 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** 距 ISO 周起始（周一）的天偏移：周一=0 … 周日=6。 */
function isoWeekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** 该日所在 ISO 周的周一。 */
function startOfIsoWeek(date: Date): Date {
  return addDays(date, -isoWeekdayIndex(date));
}

/**
 * 下一次出现日期。
 *
 * - anchor=scheduled：从 scheduledDate 推进（固定节奏：房租/例会不漂移），
 *   逾期结果保留计算值（落 Today 由视图口径表达）；
 * - anchor=completion：从 settledAt（了结时刻的账号时区日）推进（间隔型：
 *   换床单/备份从实际完成时算起）；settledAt 缺失时退回 scheduledDate；
 * - 结果超过 until（不含当天）→ null：链终止，不派生实例；
 * - 锚点缺失/非法 → null。
 */
export function nextOccurrenceDate(
  rule: RepeatRule,
  input: {
    scheduledDate: string | null;
    settledAt?: string | null;
    timeZone?: string;
    legacyDateTimeZone?: string;
  },
): string | null {
  const normalized = normalizeRepeatRule(rule);
  if (normalized === null) return null;

  let anchorValue: string | null;
  try {
    const zone = input.timeZone ?? 'UTC';
    anchorValue =
      normalized.anchor === 'completion' && input.settledAt
        ? instantDateKey(input.settledAt, zone)
        : input.scheduledDate
          ? calendarDateKey(input.scheduledDate, input.legacyDateTimeZone ?? zone)
          : null;
  } catch {
    return null;
  }
  if (anchorValue === null) return null;
  const anchor = utcDate(anchorValue);
  if (anchor === null) return null;

  let next: Date;
  switch (normalized.unit) {
    case 'day':
      next = addDays(anchor, normalized.interval);
      break;
    case 'week':
      next = nextWeeklyOccurrence(anchor, normalized);
      break;
    case 'month':
      next = addMonthsClamped(anchor, normalized.interval);
      break;
    case 'year':
      next = addMonthsClamped(anchor, normalized.interval * 12);
      break;
  }

  const nextKey = keyOf(next);
  if (normalized.until && nextKey > normalized.until) return null;
  return nextKey;
}

/**
 * week 单位的下一次出现：锚点所在周为第 0 周，第 k×interval 周为活跃周；
 * 活跃周内的指定星期几（0=周日…6=周六）都是出现日。取锚点之后（不含）
 * 的最小出现日。无 weekdays 时为「锚点 + interval 周」。
 */
function nextWeeklyOccurrence(anchor: Date, rule: RepeatRule): Date {
  if (!rule.weekdays || rule.weekdays.length === 0) {
    return addDays(anchor, rule.interval * 7);
  }
  const weekdays = new Set(rule.weekdays);
  const anchorWeekStart = startOfIsoWeek(anchor);
  // 最坏间隔：interval 周内的最后一个可能星期几 → 锚点后 interval*7 + 6 天内必有一次出现
  for (let offset = 1; offset <= rule.interval * 7 + 6; offset += 1) {
    const candidate = addDays(anchor, offset);
    if (!weekdays.has(candidate.getUTCDay())) continue;
    const weeks = Math.round(
      (startOfIsoWeek(candidate).getTime() - anchorWeekStart.getTime()) / (7 * 86_400_000),
    );
    if (weeks >= 0 && weeks % rule.interval === 0) return candidate;
  }
  // 理论不可达（interval 周内必有活跃出现日）；防御性返回
  return addDays(anchor, rule.interval * 7);
}

// ---------- 确定性 id 派生（ADR-0012） ----------

/** FNV-1a 32 位（Math.imul 保持 32 位语义，跨端确定）。 */
function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 四种子 FNV-1a → 32 位十六进制串（跨端稳定的拼接哈希）。 */
function stableHash(...parts: string[]): string {
  const canonical = parts.join('\u0000');
  const seeds = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9];
  return seeds.map((seed) => fnv1a32(canonical, seed).toString(16).padStart(8, '0')).join('');
}

/**
 * Repeat Instance id = hash(parentTaskId, canonicalRule, occurrenceDate)。
 * 同一逻辑实例无论由哪台设备派生，id 相同 —— 多设备并发完成天然去重，
 * 字段级 LWW 照常收敛（ADR-0012）。rule 必须先规范化再入哈希。
 */
export function deriveRepeatInstanceId(
  parentTaskId: string,
  rule: RepeatRule,
  occurrenceDate: string,
): string {
  return stableHash('repeat', parentTaskId, canonicalRepeatRule(rule), occurrenceDate);
}

/**
 * 派生 Subtask id = hash(parentInstanceId, subtask 序号)。
 * 两台并发派生的设备对同一父实例产出同一子任务集合。
 */
export function deriveSubtaskId(parentInstanceId: string, ordinal: number): string {
  return stableHash('subtask', parentInstanceId, String(ordinal));
}
