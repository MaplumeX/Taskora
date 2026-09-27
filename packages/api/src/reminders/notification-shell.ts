/**
 * 系统通知薄壳接口（reminders spec）。
 *
 * Reminder Scheduler 的纯计算（reminder-scheduler.ts）只产出期望的提醒
 * 集合；真正落到系统的部分收敛在本接口后面，由 Desktop / Mobile 应用在
 * boot 时注册实现（web 前端不注册 → 不支持，符合 spec 的范围划定）：
 * - 桌面（runtime 模式）：协调器到点调用 fireNow；
 * - Android（system 模式）：协调器把完整期望集交给 sync，由原生插件
 *   持久化、设置闹钟并投递（ADR-0014）。
 */

import type { ReplicaRow } from '@taskora/engine';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import type { ReminderTaskInput } from './reminder-scheduler';

/** 交付给原生的一条提醒：规则已在 JS 侧算完，文案已按当前语言组装。 */
export interface ReminderDelivery {
  key: string;
  /** 触发时刻（epoch ms）。 */
  fireAt: number;
  title: string;
  body: string;
}

/** 投递可靠性状态（Android 设置页「提醒可靠性」区）。 */
export interface ReminderReliabilityStatus {
  /** 应用级通知开关 / Android 13+ 运行时授权。 */
  notifications: boolean;
  /** reminders 渠道未被用户关闭。 */
  channelEnabled: boolean;
  /** 可以设置精确闹钟（否则最多晚到约 1 小时）。 */
  exactAlarms: boolean;
  /** 已豁免电池优化。 */
  batteryUnrestricted: boolean;
}

/** 可跳转的系统设置页（通知设置页走 openSettings）。 */
export type ReminderSettingsTarget = 'exact-alarm' | 'battery' | 'autostart';

export interface ReminderNotificationShell {
  /** 平台是否支持本地通知。 */
  isSupported(): boolean;
  /** 当前是否已获授权（首次启用提醒前 UI 用它刷新状态）。 */
  isPermissionGranted(): Promise<boolean>;
  /** 请求授权；返回是否 granted（拒绝后仍可保存 reminderTime）。 */
  requestPermission(): Promise<boolean>;
  /** runtime 模式（桌面）：到点立即发出一条通知。 */
  fireNow?(title: string, body: string): Promise<void>;
  /**
   * system 模式（Android）：交付完整期望集（不是增量）。原生侧自行与
   * 持久化计划比对，调用方不维护任何注册状态。
   */
  sync?(plan: ReminderDelivery[]): Promise<void>;
  /** system 模式：注销全部提醒并清空原生计划（登出）。 */
  clear?(): Promise<void>;
  /** 跳转到系统通知设置页（授权被拒后的引导入口）。 */
  openSettings(): Promise<void>;
  /** 投递可靠性诊断（仅 Android 实现）。 */
  reliability?(): Promise<ReminderReliabilityStatus>;
  /** 跳转到影响投递可靠性的系统设置页（仅 Android 实现）。 */
  openSystemSettings?(target: ReminderSettingsTarget): Promise<void>;
}

let shell: ReminderNotificationShell | null = null;

/**
 * 注册/注销通知薄壳。应用 boot 时调用（Tauri 环境）；不注册时
 * reminders 功能整体不可用（web 前端），UI 据此隐藏提醒区。
 */
export function setNotificationShell(next: ReminderNotificationShell | null): void {
  shell = next;
}

export function getNotificationShell(): ReminderNotificationShell | null {
  return shell;
}

/** Engine ReplicaRow → 调度输入（字段级取值，缺省按 null/ACTIVE 处理）。 */
export function reminderInputFromReplicaRow(row: ReplicaRow): ReminderTaskInput {
  const f = row.fields as Record<string, unknown>;
  return {
    id: row.id,
    title: typeof f.title === 'string' ? f.title : '',
    scheduledType: (f.scheduledType as ReminderTaskInput['scheduledType']) ?? ScheduledType.NONE,
    scheduledDate: typeof f.scheduledDate === 'string' ? f.scheduledDate : null,
    reminderTime: typeof f.reminderTime === 'string' ? f.reminderTime : null,
    status: (f.status as ReminderTaskInput['status']) ?? TaskStatus.ACTIVE,
    trashedAt: typeof f.trashedAt === 'string' ? f.trashedAt : null,
  };
}
