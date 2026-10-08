import type { ReviewInterval } from '../review';

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
  /** 时间视图（今天/随时/将来）是否按项目/区域分组任务（Grouped View）；默认 true。 */
  bucketGrouping: boolean;
  /**
   * 账号时区下最近一次查看 Today 的日期（YYYY-MM-DD）。计划日期晚于它的
   * Today 条目为「新到」（New in Today）；只进不退，跨端取较晚者。
   */
  todayReviewedOn?: string;
  /** 新建 Project / Area 的默认回顾间隔（Review Interval）；缺省为每周。 */
  defaultReviewInterval?: ReviewInterval;
}

export interface UpdatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
  weekStartsOn?: 0 | 1;
  timeZone?: string;
  bucketGrouping?: boolean;
  todayReviewedOn?: string;
  defaultReviewInterval?: ReviewInterval;
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
