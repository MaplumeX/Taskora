/**
 * 移入时机（Logging Mode，ADR 0022）：已了结的 Task / Project 何时离开原视图、
 * 成为 Logbook Entry。是否已移入是推导出来的（见 engine settledIsLogged），
 * 这里只有账号偏好的形状与写入规则。
 */

export const LOGGING_MODES = ['IMMEDIATE', 'DAILY', 'MANUAL'] as const;

export type LoggingMode = (typeof LOGGING_MODES)[number];

export const DEFAULT_LOGGING_MODE: LoggingMode = 'IMMEDIATE';

/** 推导所需的账号偏好：模式 + 水位线（ISO 时刻，在它及之前了结的已移入）。 */
export interface LoggingPreferences {
  mode: LoggingMode;
  loggedThrough: string | null;
}

export const IMMEDIATE_LOGGING: LoggingPreferences = {
  mode: DEFAULT_LOGGING_MODE,
  loggedThrough: null,
};

export function isLoggingMode(value: unknown): value is LoggingMode {
  return LOGGING_MODES.includes(value as LoggingMode);
}

/** 账号偏好（schemaless Json）里的移入时机；缺失或脏值按立即模式。 */
export function accountLogging(preferences: unknown): LoggingPreferences {
  const raw = (preferences ?? {}) as { loggingMode?: unknown; loggedThrough?: unknown };
  const through = raw.loggedThrough;
  return {
    mode: isLoggingMode(raw.loggingMode) ? raw.loggingMode : DEFAULT_LOGGING_MODE,
    loggedThrough:
      typeof through === 'string' && !Number.isNaN(Date.parse(through)) ? through : null,
  };
}

/**
 * 切换模式后的水位线：离开立即模式、或在每天 / 手动之间切换时推进到现在
 * （切换之前了结的不回到原视图）；切回立即不写（返回原值）。
 */
export function loggedThroughAfterModeChange(
  from: LoggingMode,
  to: LoggingMode,
  loggedThrough: string | null,
  now: Date,
): string | null {
  if (from === to || to === 'IMMEDIATE') return loggedThrough;
  return now.toISOString();
}
