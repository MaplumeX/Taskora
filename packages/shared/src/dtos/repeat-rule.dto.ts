/**
 * Repeat Rule（重复规则）— Task 上的结构化规则字段（recurring-tasks spec /
 * ADR-0012）。
 *
 * 声明该 Task 完成后按规则再现：单位 × 间隔 × 周模式的星期几集合，
 * 锚点默认从计划日期（Scheduled Date）推算，可选从完成日期推算。
 * 仅 ScheduledType 为 DATE 的 Task 可设；Project 不设 Repeat Rule。
 *
 * 形状刻意与 RRULE 保持可升级（BYSETPOS 等留待未来，无数据迁移）。
 */

/** 重复单位。week 可携带 weekdays 周模式。 */
export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/** 锚点：scheduled 从计划日期推算（固定节奏，不漂移）；completion 从完成日期推算（间隔型）。 */
export type RepeatAnchor = 'scheduled' | 'completion';

export interface RepeatRule {
  unit: RepeatUnit;
  /** 间隔 N（≥1）：every N unit(s)。 */
  interval: number;
  /**
   * 周模式（仅 unit=week 有意义）：0=周日 … 6=周六（JS Date#getDay 口径）。
   * 缺省表示「与锚点相同的星期几」。规范形：升序去重；非 week 单位不携带。
   */
  weekdays?: number[];
  anchor: RepeatAnchor;
  /** 直到日期（含当天，YYYY-MM-DD）：之后的再现终止链。缺省/null 表示无限。 */
  until?: string | null;
}
