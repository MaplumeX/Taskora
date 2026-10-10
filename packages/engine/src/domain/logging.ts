/**
 * 移入时机（CONTEXT：Logging Mode / Unlogged Item，ADR 0022）：已了结的条目
 * 是否已移入 Logbook，纯推导，不写 Task / Project 字段。
 */

import { instantDateKey, type LoggingPreferences } from '@taskora/shared';

import { archiveCutoff, DEFAULT_ARCHIVE_AFTER_DAYS } from '../archive';
import { instantMs, todayKey, type CalendarContext } from './calendar';

/** 视图判定的上下文：日历 + 账号的移入时机（缺省为立即）。 */
export interface ViewContext extends CalendarContext {
  logging?: LoggingPreferences;
}

/**
 * 了结时间为 settledAt 的条目是否已移入 Logbook：立即模式恒为真；否则
 * 不晚于水位线、每天模式下了结日早于今天、或早于 Archived Logbook 截止
 * 时刻（副本不再保留它）任一成立。了结时间缺失或无法解析按已移入对待。
 */
export function settledIsLogged(settledAt: unknown, context: ViewContext): boolean {
  const logging = context.logging;
  if (!logging || logging.mode === 'IMMEDIATE') return true;
  const settled = instantMs(settledAt);
  if (settled === null) return true;
  const through = instantMs(logging.loggedThrough);
  if (through !== null && settled <= through) return true;
  if (settled < Date.parse(archiveCutoff(context.now.getTime(), DEFAULT_ARCHIVE_AFTER_DAYS))) {
    return true;
  }
  if (logging.mode === 'DAILY') {
    return instantDateKey(new Date(settled), context.timeZone) < todayKey(context);
  }
  return false;
}

/** 非立即模式：已了结的条目可能还留在原视图（读视图时不能只看未了结的）。 */
export function keepsSettledInViews(context: ViewContext): boolean {
  return context.logging !== undefined && context.logging.mode !== 'IMMEDIATE';
}
