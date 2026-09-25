/**
 * Reminder 协调器 — 纯调度计算（reminder-scheduler.ts）与通知薄壳
 * （notification-shell.ts）之间的运行时装配。
 *
 * 两种模式（reminders spec）：
 * - runtime（桌面）：不注册系统级排程，由内部 tick 到点 fireNow；
 *   App 未运行期间错过的提醒静默丢弃，绝不补发。
 * - system（移动）：经 shell 注册系统级定时通知，App 关闭/离线仍按
 *   系统排程触发；数据每次变更后重算差量，消失或改期的注册被注销。
 *
 * 触发时机：Engine 副本变更（本地写或应用远端写）+ 周期 tick（兜底
 * 跨天滚动与启动后的首次对齐）。
 */

import type { Engine } from '@taskora/engine';

import {
  computeReminderPlan,
  diffReminderRegistration,
  isReminderEligible,
  type ReminderNotification,
} from './reminder-scheduler';
import {
  reminderInputFromReplicaRow,
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

export function createReminderCoordinator(options: ReminderCoordinatorOptions): ReminderCoordinator {
  const { engine, shell, mode } = options;
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const now = options.now ?? (() => new Date());
  const texts = options.texts ?? defaultTexts;

  /** key → 当前注册的 fireAt（runtime 为内存表，system 对应系统注册）。 */
  let registered = new Map<string, number>();
  /** key → 最近一次注册的完整信息（runtime 触发时要用的文案）。 */
  const meta = new Map<string, ReminderNotification>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function tick(): Promise<void> {
    const rows = await engine.list('task');
    const tasks = rows.map(reminderInputFromReplicaRow);
    const nowMs = now().getTime();
    const desired = computeReminderPlan(tasks, now());
    const diff = diffReminderRegistration(registered, desired);
    const tasksById = new Map(tasks.map((t) => [t.id, t]));
    // 同 key 改期会在同一批同时出现 cancel + register（新 fireAt），
 // 此时旧时刻的补发跳过——用户意图是改到新时刻，不是补旧钟。
    const reRegistering = new Set(diff.register.map((n) => n.key));

    // 先注销后注册：同一 key 改期时 cancel 先落到系统侧，随后的
    // schedule 重新登记（否则先 set 后 delete 会把注册表清丢）。
    for (const key of diff.cancel) {
      const m = meta.get(key);
      // runtime 到点路径：App 运行中错过 tick 边界的提醒补发。仅当
      // 任务本身仍符合提醒条件（未了结/未 Trash/仍为 DATE）且不足
      // 改期注销——否则（spec story 7）已完结的工作绝不通知。
      if (
        mode === 'runtime' &&
        m &&
        m.fireAt <= nowMs &&
        !reRegistering.has(key) &&
        tasksById.get(m.taskId) != null &&
        isReminderEligible(tasksById.get(m.taskId)!)
      ) {
        const { title, body } = texts(m);
        void shell.fireNow(title, body).catch(noop);
      }
      if (mode === 'system') {
        await shell.cancel(key).catch(noop);
      }
      registered.delete(key);
      meta.delete(key);
    }

    for (const n of diff.register) {
      if (mode === 'system') {
        const { title, body } = texts(n);
        const ok = await shell.schedule(n.key, title, body, n.fireAt).then(
          () => true,
          () => false,
        );
        // 注册失败不落表：否则内存注册表与系统侧脱节，失败后永不再试
        // （仅数据变更才重算差量）。不落表则下个 tick 自动重试——授权
        // 或渠道恢复后自愈。
        if (!ok) continue;
      }
      registered.set(n.key, n.fireAt);
      meta.set(n.key, n);
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
      timer = setInterval(() => void reschedule(), tickMs);
      void reschedule();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      unsubscribe?.();
      unsubscribe = null;
      // system 模式停止（登出/装配失败）时注销全部系统注册，避免残留
      // 孤儿通知；runtime 模式系统侧本无注册，只清内存表。
      if (mode === 'system') {
        for (const key of registered.keys()) {
          void shell.cancel(key).catch(noop);
        }
      }
      registered = new Map();
      meta.clear();
    },
    reschedule,
  };
}

function defaultTexts(n: ReminderNotification): { title: string; body: string } {
  const d = new Date(n.fireAt);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { title: n.taskTitle, body: `${hh}:${mm}` };
}
