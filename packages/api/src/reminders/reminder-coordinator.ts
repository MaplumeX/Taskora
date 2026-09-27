/**
 * Reminder 协调器 — 纯调度计算（reminder-scheduler.ts）与通知薄壳
 * （notification-shell.ts）之间的运行时装配。
 *
 * 两种模式（reminders spec）：
 * - runtime（桌面）：不注册系统级排程，由内部 tick 到点 fireNow；
 *   App 未运行期间错过的提醒静默丢弃，绝不补发。
 * - system（Android，ADR-0014）：每次重算把完整期望集交给 shell.sync，
 *   由原生插件持久化、差量、设置闹钟与投递。协调器不保存任何注册状态
 *   ——进程会被回收，系统闹钟却持续存在，对账只能在原生侧做。
 *
 * 触发时机：Engine 副本变更（本地写或应用远端写）+ 周期 tick（兜底
 * 跨天滚动与启动后的首次对齐）。
 */

import { currentTimeZone, currentLegacyDateTimeZone } from '@/utils/date';
import { usePreferencesStore } from '@/stores/preferences.store';
import type { Engine } from '@taskora/engine';

import {
  computeReminderPlan,
  reminderFireAt,
  diffReminderRegistration,
  isReminderEligible,
  type ReminderNotification,
} from './reminder-scheduler';
import {
  reminderInputFromReplicaRow,
  type ReminderDelivery,
  type ReminderNotificationShell,
} from './notification-shell';

export interface ReminderCoordinatorOptions {
  engine: Engine;
  shell: ReminderNotificationShell;
  mode: 'runtime' | 'system';
  /** 周期 tick 间隔（默认 30s）。 */
  tickMs?: number;
  /** 可注入的时钟（测试确定性）。 */
  now?: () => Date;
  /** 通知文案组装（默认：标题=任务名，正文=HH:mm）。 */
  texts?: (notification: ReminderNotification) => { title: string; body: string };
}

export interface ReminderCoordinator {
  start(): void;
  stop(): void;
  /** 立即重算一次（启动对齐、测试与显式触发用）。 */
  reschedule(): Promise<void>;
}

const DEFAULT_TICK_MS = 30_000;
const noop = () => undefined;

export function createReminderCoordinator(
  options: ReminderCoordinatorOptions,
): ReminderCoordinator {
  const { engine, shell, mode } = options;
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const now = options.now ?? (() => new Date());
  const texts = options.texts ?? defaultTexts;

  /** runtime：key → 当前登记的 fireAt（内存表，到点 fireNow）。 */
  let registered = new Map<string, number>();
  /** runtime：key → 最近一次登记的完整信息（触发时要用的文案）。 */
  const meta = new Map<string, ReminderNotification>();
  /**
   * system：最近一次成功交付的期望集签名。期望集未变时跳过 sync（周期
   * tick 不反复打扰原生）；交付失败不记录，下个 tick 自动重试。
   */
  let lastSynced: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let unsubscribeZone: (() => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function tick(): Promise<void> {
    const rows = await engine.list('task');
    const tasks = rows.map(reminderInputFromReplicaRow);
    const nowMs = now().getTime();
    const desired = computeReminderPlan(
      tasks,
      now(),
      currentTimeZone(),
      currentLegacyDateTimeZone(),
    );
    if (mode === 'system') {
      await deliver(desired);
      return;
    }

    const diff = diffReminderRegistration(registered, desired, nowMs);
    const tasksById = new Map(tasks.map((t) => [t.id, t]));

    // 自然到点：补发跨越 tick 边界的提醒——前提是任务仍符合条件且时刻
    // 未被改动（到点后才了结/改期的不补发）。
    for (const key of diff.due) {
      const m = meta.get(key);
      const task = m ? tasksById.get(m.taskId) : undefined;
      if (
        m &&
        task != null &&
        isReminderEligible(task) &&
        reminderFireAt(
          task.scheduledDate!,
          task.reminderTime!,
          currentTimeZone(),
          currentLegacyDateTimeZone(),
        ) === m.fireAt
      ) {
        const { title, body } = texts(m);
        void shell.fireNow?.(title, body).catch(noop);
      }
      registered.delete(key);
      meta.delete(key);
    }

    // 先注销后登记：同一 key 改期时同时出现在 cancel 与 register。
    for (const key of diff.cancel) {
      registered.delete(key);
      meta.delete(key);
    }
    for (const n of diff.register) {
      registered.set(n.key, n.fireAt);
      meta.set(n.key, n);
    }
  }

  async function deliver(desired: ReminderNotification[]): Promise<void> {
    if (!shell.sync) return;
    const plan: ReminderDelivery[] = desired.map((n) => ({
      key: n.key,
      fireAt: n.fireAt,
      ...texts(n),
    }));
    const signature = JSON.stringify(plan);
    if (signature === lastSynced) return;
    try {
      await shell.sync(plan);
      lastSynced = signature;
    } catch (error) {
      console.warn('[reminders] sync failed:', error);
    }
  }

  async function reschedule(): Promise<void> {
    // 串行化：engine.list 异步竞态下避免旧结果覆盖新结果。
    chain = chain.then(tick, noop);
    await chain;
  }

  return {
    start() {
      if (timer !== null) return;
      unsubscribe = engine.onChange(() => void reschedule());
      unsubscribeZone = usePreferencesStore.subscribe((state, previous) => {
        if (
          state.timeZone !== previous.timeZone ||
          state.legacyDateTimeZone !== previous.legacyDateTimeZone
        )
          void reschedule();
      });
      timer = setInterval(() => void reschedule(), tickMs);
      void reschedule();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      unsubscribe?.();
      unsubscribeZone?.();
      unsubscribeZone = null;
      unsubscribe = null;
      // system 模式停止（登出/装配失败）时清空原生计划与全部闹钟，避免
      // 残留孤儿通知；runtime 模式系统侧本无注册。
      if (mode === 'system') {
        void shell.clear?.().catch(noop);
      }
      registered = new Map();
      meta.clear();
      lastSynced = null;
    },
    reschedule,
  };
}

function defaultTexts(n: ReminderNotification): { title: string; body: string } {
  const body = new Intl.DateTimeFormat('en-GB', {
    timeZone: currentTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(n.fireAt));
  return { title: n.taskTitle, body };
}
