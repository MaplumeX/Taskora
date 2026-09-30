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

import type { ReminderDelivery, ReminderTaskInput, ReplicaRow } from '@taskora/engine';
import { ScheduledType, TaskStatus } from '@taskora/shared';

import type { ReminderActionRequest } from './reminder-action';

export type { ReminderDelivery };

/**
 * 计划所依据的副本状态（local-first-v3 issue 09）。Android 的后台同步会
 * 用 hub 计算的计划替换原生计划；原生据此判断两者谁更新：
 * - `cursor`：副本已拉到的 hub 变更日志位置；
 * - `pendingLocal`：Outbox 里还有未推送的本地写（hub 计划不含它们）。
 */
export interface ReminderPlanBasis {
  cursor: number;
  pendingLocal: boolean;
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
  /**
   * runtime 模式（桌面）：到点立即发出一条通知。携带 taskId / fireAt，
   * 供通知按钮与点击回传（reminder-actions spec）。
   */
  fireNow?(reminder: ReminderDelivery): Promise<void>;
  /**
   * system 模式（Android）：交付完整期望集（不是增量）。原生侧自行与
   * 持久化计划比对，调用方不维护任何注册状态。basis 是计划依据的副本
   * 状态：副本落后于后台取回的 hub 计划、又没有未推送的本地写时，原生
   * 保留 hub 计划。
   */
  sync?(plan: ReminderDelivery[], basis: ReminderPlanBasis): Promise<void>;
  /** system 模式：注销全部提醒并清空原生计划（登出）。 */
  clear?(): Promise<void>;
  /**
   * system 模式：取走原生排队的通知操作（完成 / Snooze，取出即删）。
   * App 进程不在时点通知按钮，操作先落原生队列，JS 下次运行时应用。
   */
  takePendingActions?(): Promise<ReminderActionRequest[]>;
  /** system 模式：原生有新排队操作时回调（进程存活时立即应用）；返回注销函数。 */
  onActionsAvailable?(listener: () => void): Promise<() => void>;
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
    notes: typeof f.notes === 'string' ? f.notes : null,
    projectId: typeof f.projectId === 'string' ? f.projectId : null,
    areaId: typeof f.areaId === 'string' ? f.areaId : null,
  };
}
