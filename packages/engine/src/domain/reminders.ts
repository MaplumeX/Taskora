/**
 * Reminder 规则（reminders spec；local-first-v3 issue 09 移入共享 domain）。
 *
 * 设备（Reminder 协调器，按副本计算）与 hub（`GET /reminders/plan`，供
 * Android 后台同步按 Postgres 计算）共用这一份：期望集、触发时刻、
 * 「明天」时刻与通知文案。系统通知 API 在本模块之外（各端的通知薄壳 /
 * 原生插件），规则可用 vitest 直测外部行为。
 *
 * 清理规则在本层的体现（数据层兜底见 task-backend）：
 * - 了结（COMPLETED/CANCELLED）或 Trash → 不产出（不会注册，已有注册被 cancel）；
 * - ScheduledType 离开 DATE → 不产出；
 * - 计划日期变化 → key 不变、fireAt 跟随新日期（时刻保留）；
 * - 过去的提醒（含错过未发的）静默丢弃，绝不补发。
 */

import {
  addCalendarDays,
  calendarDateKey,
  calendarTimeInstant,
  instantWallTime,
  ScheduledType,
  TaskStatus,
} from '@taskora/shared';

/** 调度输入：Task 行上与提醒相关的字段（ReplicaRow / Postgres 行均可满足）。 */
export interface ReminderTaskInput {
  id: string;
  title: string;
  scheduledType: ScheduledType;
  scheduledDate: string | null;
  reminderTime: string | null;
  status: TaskStatus;
  trashedAt: string | null;
  /** 通知文案上下文（可选；纯调度不依赖）。 */
  notes?: string | null;
  projectId?: string | null;
  areaId?: string | null;
}

/** 一条期望存在的提醒通知。 */
export interface ReminderNotification {
  /** 稳定 key：同一 Task 的提醒跨重算保持同一 key，供 diff 与注销。 */
  key: string;
  taskId: string;
  taskTitle: string;
  /** 触发时刻（epoch ms，账号时区墙上时钟语义）。 */
  fireAt: number;
  /** 触发日 + 1 的同一时刻：原生侧临时重设「明天」Snooze 闹钟用（reminder-actions spec）。 */
  snoozeTomorrowAt: number;
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
 * 未了结未进 Trash 的任务产出；fireAt = 计划日当天 + 提醒时刻（账号
 * 时区），fireAt <= now 的（已错过）静默丢弃——错过的提醒不补发。
 */
export function computeReminderPlan(
  tasks: ReminderTaskInput[],
  now: Date,
  timeZone = 'UTC',
  legacyZone = timeZone,
): ReminderNotification[] {
  const nowMs = now.getTime();
  const plan: ReminderNotification[] = [];
  for (const t of tasks) {
    if (!isReminderEligible(t)) continue;
    const fireAt = reminderFireAt(t.scheduledDate!, t.reminderTime!, timeZone, legacyZone);
    if (fireAt === null || fireAt <= nowMs) continue;
    plan.push({
      key: reminderNotificationKey(t.id),
      taskId: t.id,
      taskTitle: t.title,
      fireAt,
      snoozeTomorrowAt: snoozeTomorrowAt(fireAt, timeZone),
    });
  }
  return plan;
}

/** 已注册集：key → 当前注册的 fireAt（移动端为系统注册，桌面为内存表）。 */
export interface ReminderRegistrationDiff {
  /** 需要（重新）注册的通知。 */
  register: ReminderNotification[];
  /** 因数据变更需要注销的 key。 */
  cancel: string[];
  /** 自然到点、等待系统触发而不再期望注册的 key。 */
  due: string[];
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
  nowMs = Date.now(),
): ReminderRegistrationDiff {
  const desiredByKey = new Map(desired.map((n) => [n.key, n]));
  const register: ReminderNotification[] = [];
  const cancel: string[] = [];
  const due: string[] = [];
  for (const n of desired) {
    const current = registered.get(n.key);
    if (current === undefined || current !== n.fireAt) {
      register.push(n);
      if (current !== undefined) cancel.push(n.key);
    }
  }
  for (const [key, fireAt] of registered) {
    if (!desiredByKey.has(key)) {
      if (fireAt <= nowMs) {
        // 自然到点：系统侧可能仍在排队触发，绝不能取消；仅本地退役。
        due.push(key);
      } else {
        cancel.push(key);
      }
    }
  }
  return { register, cancel, due };
}

/** 计划日期 + HH:mm → 账号时区当天该时刻的 epoch ms；解析失败返回 null。 */
export function reminderFireAt(
  scheduledDate: string,
  reminderTime: string,
  timeZone: string,
  legacyZone = timeZone,
): number | null {
  try {
    return calendarTimeInstant(calendarDateKey(scheduledDate, legacyZone), reminderTime, timeZone);
  } catch {
    return null;
  }
}

/**
 * 通知触发日 + 1 的同一时刻（epoch ms）：随计划下发给原生侧，供 App 进程
 * 不在时临时重设「明天」闹钟（原生不重写时区规则，ADR-0014）。触发当天点击
 * 时与 Reminder Action 的「明天」一致；数据改写仍以 JS 应用队列时的结果为准。
 */
export function snoozeTomorrowAt(fireAt: number, timeZone: string): number {
  const { date, time } = instantWallTime(fireAt, timeZone);
  return calendarTimeInstant(addCalendarDays(date, 1), time, timeZone);
}

/** 文案上下文：由调用方按任务当前行查出。 */
export interface ReminderTextContext {
  /** 所属 Project 名（无 Project 时为 Area 名）。 */
  parentName: string | null;
  notes: string | null;
}

export interface ReminderTexts {
  title: string;
  body: string;
}

/** 备注首行的最大长度（超出截断加省略号）。 */
const NOTE_LINE_MAX = 80;

/**
 * 通知文案（reminder-actions spec）：title 为任务标题；body 为
 * `HH:mm · <Project 名或 Area 名>`，备注非空时另起一行附备注首行。与语言
 * 无关（按钮文案按 App 语言由各端提供，原生随计划持久化）。
 */
export function buildReminderTexts(
  notification: ReminderNotification,
  context: ReminderTextContext,
  timeZone: string,
): ReminderTexts {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(notification.fireAt));
  const parent = context.parentName?.trim();
  let body = parent ? `${time} · ${parent}` : time;
  const noteLine = firstNoteLine(context.notes);
  if (noteLine) body += `\n${noteLine}`;
  return { title: notification.taskTitle, body };
}

function firstNoteLine(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const chars = Array.from(line);
  return chars.length > NOTE_LINE_MAX ? `${chars.slice(0, NOTE_LINE_MAX).join('')}…` : line;
}

/** 交付给原生的一条提醒：规则与文案都已算完（ADR-0014 的 `sync(plan)` 条目）。 */
export interface ReminderDelivery {
  key: string;
  taskId: string;
  /** 触发时刻（epoch ms）。 */
  fireAt: number;
  /** 触发日 + 1 的同一时刻：原生在 App 未运行时临时重设「明天」闹钟用。 */
  snoozeTomorrowAt: number;
  title: string;
  body: string;
}

/** 按任务 id 查文案上下文的名称表（Project / Area 标题）。 */
export interface ReminderParentTitles {
  projects: ReadonlyMap<string, string>;
  areas: ReadonlyMap<string, string>;
}

/**
 * 完整交付计划：期望集 + 文案。协调器（副本）与 hub（Postgres）各自读出
 * 任务与名称表后调用，两端产出逐字一致的计划。
 */
export function planReminderDeliveries(
  tasks: ReminderTaskInput[],
  now: Date,
  zones: { timeZone: string; legacyDateTimeZone: string },
  titles: ReminderParentTitles,
): ReminderDelivery[] {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  return computeReminderPlan(tasks, now, zones.timeZone, zones.legacyDateTimeZone).map((n) => ({
    key: n.key,
    taskId: n.taskId,
    fireAt: n.fireAt,
    snoozeTomorrowAt: n.snoozeTomorrowAt,
    ...buildReminderTexts(n, reminderTextContext(tasksById.get(n.taskId)!, titles), zones.timeZone),
  }));
}

/** 文案上下文：Project 名优先，其次 Area 名。 */
export function reminderTextContext(
  task: ReminderTaskInput,
  titles: ReminderParentTitles,
): ReminderTextContext {
  return {
    parentName:
      (task.projectId ? titles.projects.get(task.projectId) : undefined) ??
      (task.areaId ? titles.areas.get(task.areaId) : undefined) ??
      null,
    notes: task.notes ?? null,
  };
}
