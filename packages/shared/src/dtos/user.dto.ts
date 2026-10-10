import type { LoggingMode } from '../logging';
import type { ReviewIntervalDefaults } from '../review';

export interface UpdateProfileDto {
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'zh' | 'en';
  weekStartsOn: 0 | 1;
  /** Account IANA time zone; absent on pre-time-zone accounts. */
  timeZone?: string;
  /** Immutable decoding zone for pre-date-only records; server-managed. */
  legacyDateTimeZone?: string;
  /** 时间视图（今天/随时/某天）是否按项目/区域分组任务（Grouped View）；默认 true。 */
  bucketGrouping: boolean;
  /**
   * 账号时区下最近一次确认 Today 新到的日期（YYYY-MM-DD）。计划日期晚于它的
   * Today 条目为「新到」（New in Today）；只进不退，跨端取较晚者。
   */
  todayReviewedOn?: string;
  /**
   * New in Today 单条已读（见 mergeTodaySeenKeys）：`<type>:<id>@<计划日期>`；
   * 跨端取并集，计划日期不晚于 todayReviewedOn 的元素剔除。
   */
  todaySeenKeys?: string[];
  /**
   * 默认回顾间隔（Default Review Interval）：项目 / Area 两档，只决定新建时
   * 写入的回顾间隔；缺省为每周 / 每月。
   */
  defaultReviewIntervals?: ReviewIntervalDefaults;
  /** 移入时机（Logging Mode，ADR 0022）；缺省为立即。LWW。 */
  loggingMode?: LoggingMode;
  /**
   * 移入水位线（ISO 时刻）：在它及之前了结的条目已移入 Logbook。Log Completed
   * 推进它，撤销把它退回原值；LWW，不取较晚者。
   */
  loggedThrough?: string | null;
}

export interface UpdatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
  weekStartsOn?: 0 | 1;
  timeZone?: string;
  bucketGrouping?: boolean;
  todayReviewedOn?: string;
  todaySeenKeys?: string[];
  defaultReviewIntervals?: ReviewIntervalDefaults;
  loggingMode?: LoggingMode;
  loggedThrough?: string | null;
}

export interface DeleteAccountDto {
  password: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  preferences: UserPreferences | null;
  createdAt: string;
  updatedAt: string;
}
