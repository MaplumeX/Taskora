/**
 * 系统通知薄壳接口（reminders spec）。
 *
 * Reminder Scheduler 的纯计算（reminder-scheduler.ts）只产出「应注册/
 * 应注销」的通知集合；真正落到系统通知 API（tauri-plugin-notification）
 * 的部分收敛在本接口后面，由 Desktop / Mobile 应用在 boot 时注册实现
 * （web 前端不注册 → 不支持，符合 spec 的范围划定）。
 */

import type { Engine } from '@taskora/engine';
import type { ReplicaRow } from '@taskora/engine';

import type { ReminderTaskInput } from './reminder-scheduler';

export interface ReminderNotificationShell {
  /** 平台是否支持本地通知。 */
  isSupported(): boolean;
  /** 当前是否已获授权（首次启用提醒前 UI 用它刷新状态）。 */
  isPermissionGranted(): Promise<boolean>;
  /** 请求授权；返回是否 granted（拒绝后仍可保存 reminderTime）。 */
  requestPermission(): Promise<boolean>;
  /** 注册/更新一条系统级定时通知（移动端：App 关闭后仍按系统排程触发）。 */
  schedule(key: string, title: string, body: string, fireAt: number): Promise<void>;
  /** 注销一条已注册的系统通知。 */
  cancel(key: string): Promise<void>;
  /** 立即发出一条通知（桌面运行时调度路径：到点即发）。 */
  fireNow(title: string, body: string): Promise<void>;
  /** 跳转到系统通知设置页（授权被拒后的引导入口）。 */
  openSettings(): Promise<void>;
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

/**
 * 字符串 key → 稳定 32 位数字通知 id（tauri-plugin-notification 的
 * Options.id 要求数字）。FNV-1a：同 key 恒等映射，跨进程重启后注销
 * 仍能命中同一系统通知。
 */
export function notificationIdForKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Engine ReplicaRow → 调度输入（字段级取值，缺省按 null/ACTIVE 处理）。 */
export function reminderInputFromReplicaRow(row: ReplicaRow): ReminderTaskInput {
  const f = row.fields as Record<string, unknown>;
  return {
    id: row.id,
    title: typeof f.title === 'string' ? f.title : '',
    scheduledType: (f.scheduledType as ReminderTaskInput['scheduledType']) ?? 'NONE',
    scheduledDate: typeof f.scheduledDate === 'string' ? f.scheduledDate : null,
    reminderTime: typeof f.reminderTime === 'string' ? f.reminderTime : null,
    status: (f.status as ReminderTaskInput['status']) ?? 'ACTIVE',
    trashedAt: typeof f.trashedAt === 'string' ? f.trashedAt : null,
  };
}

export type { Engine };
