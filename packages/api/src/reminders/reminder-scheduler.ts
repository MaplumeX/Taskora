/**
 * Reminder Scheduler — 纯客户端调度计算（reminders spec 新 seam）。
 *
 * 输入：任务集（计划日期 + reminderTime + 终态/Trash 状态）与当前时刻。
 * 输出：期望存在的系统通知集合（register/cancel 差量由
 * diffReminderRegistration 相对已注册集计算）。Tauri 通知 API 在本模块
 * 之外（apps 侧的 NotificationShell 薄壳），保证这段规则可用 vitest
 * 直测外部行为。
 *
 * 清理规则在本层的体现（数据层兜底见 task-backend）：
 * - 了结（COMPLETED/CANCELLED）或 Trash → 不产出（不会注册，已有注册被 cancel）；
 * - ScheduledType 离开 DATE → 不产出；
 * - 计划日期变化 → key 不变、fireAt 跟随新日期（时刻保留）；
 * - 过去的提醒（含错过未发的）静默丢弃，绝不补发。
 */

import { ScheduledType, TaskStatus } from '@taskora/shared';

/** 调度输入：Task 行上与提醒相关的字段（ReplicaRow / DTO 均可满足）。 */
export interface ReminderTaskInput {
  id: string;
  title: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  reminderTime: string | null;
  status: TaskStatus;
  trashedAt: string | null;
}

/** 一条期望存在的提醒通知。 */
export interface ReminderNotification {
  /** 稳定 key：同一 Task 的提醒跨重算保持同一 key，供 diff 与注销。 */
  key: string;
  taskId: string;
  taskTitle: string;
  /** 触发时刻（epoch ms，设备本地时区语义）。 */
  fireAt: number;
}

/** HH:mm 校验（00:00–23:59）。 */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 通知 key：`reminder:<taskId>`（与系统通知的数字 id 映射由 Shell 负责）。 */
export function reminderNotificationKey(taskId: string): string {
  return `reminder:${taskId}`;
}

/**
 * 任务是否仍符合提醒的数据条件（DATE 型、有计划日、合法 HH:mm、
 * 未了结未进 Trash）。不含时间判断——协调器用它区分「到点注销」与
 * 「数据变更注销」（后者绝不补发）。
 */
export function isReminderEligible(task: ReminderTaskInput): boolean {
  return (
    task.scheduledType === ScheduledType.DATE &&
    task.status === TaskStatus.ACTIVE &&
    task.trashedAt == null &&
    task.scheduledDate != null &&
    task.reminderTime != null &&
    HH_MM.test(task.reminderTime)
  );
}

/**
 * 计算期望的通知集合。
 *
 * 规则：仅 ScheduledType 为 DATE、有计划日期、有合法 HH:mm 提醒、且
 * 未了结未进 Trash 的任务产出；fireAt = 计划日当天 + 提醒时刻（本地
 * 时区），fireAt <= now 的（已错过）静默丢弃——错过的提醒不补发。
 */
export function computeReminderPlan(
  tasks: ReminderTaskInput[],
  now: Date,
): ReminderNotification[] {
  const nowMs = now.getTime();
  const plan: ReminderNotification[] = [];
  for (const t of tasks) {
    if (!isReminderEligible(t)) continue;
    const fireAt = fireAtOf(t.scheduledDate!, t.reminderTime!);
    if (fireAt === null || fireAt <= nowMs) continue;
    plan.push({
      key: reminderNotificationKey(t.id),
      taskId: t.id,
      taskTitle: t.title,
      fireAt,
    });
  }
  return plan;
}

/** 已注册集：key → 当前注册的 fireAt（移动端为系统注册，桌面为内存表）。 */
export interface ReminderRegistrationDiff {
  /** 需要（重新）注册的通知。 */
  register: ReminderNotification[];
  /** 需要注销的 key。 */
  cancel: string[];
}

/**
 * 期望集 vs 已注册集的差量：消失或 fireAt 变化的 key 注销、缺失或
 * fireAt 变化的注册（重新）登记；完全一致的保持不动（幂等，避免每次
 * 重算都重排系统通知）。同一 key 改期时同时出现在 cancel 与 register，
 * 消费方必须先应用 cancel 再应用 register（先注销后注册）。
 */
export function diffReminderRegistration(
  registered: Map<string, number>,
  desired: ReminderNotification[],
): ReminderRegistrationDiff {
  const desiredByKey = new Map(desired.map((n) => [n.key, n]));
  const register: ReminderNotification[] = [];
  const cancel: string[] = [];
  for (const n of desired) {
    const current = registered.get(n.key);
    if (current === undefined || current !== n.fireAt) {
      register.push(n);
      if (current !== undefined) cancel.push(n.key);
    }
  }
  for (const key of registered.keys()) {
    if (!desiredByKey.has(key)) cancel.push(key);
  }
  return { register, cancel };
}

/** 计划日期（ISO）+ HH:mm → 本地时区当天该时刻的 epoch ms；解析失败返回 null。 */
function fireAtOf(scheduledDate: string, reminderTime: string): number | null {
  const day = new Date(scheduledDate);
  if (Number.isNaN(day.getTime())) return null;
  const [hours, minutes] = reminderTime.split(':').map(Number);
  // 用本地当天构造（计划日期是纯日期语义，不带时区偏移）：取 day 的
  // 本地年月日，避免 ISO 字符串被按 UTC 解析后在西半球时区漂移一天。
  const fire = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  return fire.getTime();
}
