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
  /** 时间视图（今天/随时/将来）是否按项目/领域分组任务（Grouped View）；默认 true。 */
  bucketGrouping: boolean;
}

export interface UpdatePreferencesDto {
  theme?: 'light' | 'dark' | 'system';
  language?: 'zh' | 'en';
  weekStartsOn?: 0 | 1;
  timeZone?: string;
  bucketGrouping?: boolean;
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
