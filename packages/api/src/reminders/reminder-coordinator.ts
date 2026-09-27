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
import { reminderInputFromReplicaRow, type ReminderNotificationShell } from './notification-shell';

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

  /** key → 当前注册的 fireAt（runtime 为内存表，system 对应系统注册）。 */
  let registered = new Map<string, number>();
  /** key → 最近一次注册的完整信息（runtime 触发时要用的文案）。 */
  const meta = new Map<string, ReminderNotification>();
  /** system 模式：已自然到点但仍由系统排程持有的 key。 */
  const due = new Set<string>();
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
    const diff = diffReminderRegistration(registered, desired, nowMs);
    const tasksById = new Map(tasks.map((t) => [t.id, t]));

    // 先注销后注册：同一 key 改期时 cancel 先落到系统侧，随后的
    // schedule 重新登记（否则先 set 后 delete 会把注册表清丢）。
    // 自然到点：system 排程交给系统触发（原生 cancel 会同时撤销待
    // 触发排程和已显示通知，绝不能调用）；runtime 模式仍由本协调器
    // 补发跨越 tick 边界的提醒。
    for (const key of diff.due) {
      const m = meta.get(key);
      if (
        mode === 'runtime' &&
        m &&
        tasksById.get(m.taskId) != null &&
        isReminderEligible(tasksById.get(m.taskId)!) &&
        reminderFireAt(
          tasksById.get(m.taskId)!.scheduledDate!,
          tasksById.get(m.taskId)!.reminderTime!,
          currentTimeZone(),
          currentLegacyDateTimeZone(),
        ) === m.fireAt
      ) {
        const { title, body } = texts(m);
        void shell.fireNow(title, body).catch(noop);
      }
      registered.delete(key);
      meta.delete(key);
      if (mode === 'system') due.add(key);
    }

    for (const key of diff.cancel) {
      if (mode === 'system') {
        await shell.cancel(key).catch(noop);
      }
      registered.delete(key);
      meta.delete(key);
    }

    for (const n of diff.register) {
      // 用户重新排到期key：它不再属于「待系统自然触发」集合；随后以新
      // fireAt 注册/恢复跟踪。
      due.delete(n.key);
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
      // system 模式停止（登出/装配失败）时注销全部系统注册与待触发的
      // 已到期排程，避免残留孤儿通知；runtime 模式系统侧本无注册。
      if (mode === 'system') {
        for (const key of [...registered.keys(), ...due]) {
          void shell.cancel(key).catch(noop);
        }
      }
      registered = new Map();
      meta.clear();
      due.clear();
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
