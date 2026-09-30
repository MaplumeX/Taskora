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
 *
 * 规则与文案来自共享 domain（@taskora/engine）：hub 为 Android 后台同步
 * 计算的计划（`GET /reminders/plan`，local-first-v3 issue 09）与这里逐字
 * 一致。system 模式随计划附上副本基准（cursor、有无未推送的本地写），
 * 原生据此在自己的计划与后台取回的 hub 计划之间取较新者。
 */

import { currentTimeZone, currentLegacyDateTimeZone } from '@/utils/date';
import { usePreferencesStore } from '@/stores/preferences.store';
import {
  buildReminderTexts,
  computeReminderPlan,
  diffReminderRegistration,
  isReminderEligible,
  planReminderDeliveries,
  reminderFireAt,
  reminderTextContext,
  type Engine,
  type ReminderNotification,
  type ReminderParentTitles,
  type ReminderTaskInput,
} from '@taskora/engine';

import type { TaskBackend } from '../api/task-backend';
import { createEngineTaskBackend } from '../engine/task-backend.engine';

import {
  resolveReminderAction,
  type ReminderActionRequest,
  type ReminderActionResolution,
} from './reminder-action';
import { reminderInputFromReplicaRow, type ReminderNotificationShell } from './notification-shell';

export interface ReminderCoordinatorOptions {
  engine: Engine;
  shell: ReminderNotificationShell;
  mode: 'runtime' | 'system';
  /** 周期 tick 间隔（默认 30s）。 */
  tickMs?: number;
  /** 可注入的时钟（测试确定性）。 */
  now?: () => Date;
  /** 通知操作的写入口（默认基于同一 engine 的 Task 传输层）。 */
  tasks?: Pick<TaskBackend, 'completeTask' | 'updateTask'>;
}

export interface ReminderCoordinator {
  start(): void;
  stop(): void;
  /** 立即重算一次（启动对齐、测试与显式触发用）。 */
  reschedule(): Promise<void>;
  /**
   * 应用一次通知操作（完成 / Snooze，reminder-actions spec）：按 Reminder
   * Action 规则校验并写入任务，随后重算。返回判定结果（丢弃时不写入）。
   */
  applyAction(request: ReminderActionRequest): Promise<ReminderActionResolution>;
}

const DEFAULT_TICK_MS = 30_000;
const noop = () => undefined;
const EMPTY_TITLES: ReminderParentTitles = { projects: new Map(), areas: new Map() };

export function createReminderCoordinator(
  options: ReminderCoordinatorOptions,
): ReminderCoordinator {
  const { engine, shell, mode } = options;
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const now = options.now ?? (() => new Date());
  const tasksBackend = options.tasks ?? createEngineTaskBackend({ engine });

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
  let unsubscribeActions: (() => void) | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function tick(): Promise<void> {
    // system：先应用原生排队的通知操作，再按写入后的数据交付计划——否则
    // 这次 sync 会把原生为 Snooze 临时设置的闹钟当作「已消失」注销。
    if (mode === 'system' && shell.takePendingActions) {
      await drainPendingActions(shell.takePendingActions);
    }
    // 只有带提醒时刻的任务可能进入计划（isReminderEligible 的必要条件）
    const rows = await engine.list('task', { where: { reminderTime: { notNull: true } } });
    const tasks = rows.map(reminderInputFromReplicaRow);
    if (mode === 'system') {
      await deliver(tasks);
      return;
    }

    const nowMs = now().getTime();
    const desired = computeReminderPlan(
      tasks,
      now(),
      currentTimeZone(),
      currentLegacyDateTimeZone(),
    );
    const diff = diffReminderRegistration(registered, desired, nowMs);
    const tasksById = new Map(tasks.map((t) => [t.id, t]));
    const titles = diff.due.length > 0 ? await parentTitles() : null;

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
        void shell
          .fireNow?.({
            key: m.key,
            taskId: m.taskId,
            fireAt: m.fireAt,
            snoozeTomorrowAt: m.snoozeTomorrowAt,
            ...buildReminderTexts(m, reminderTextContext(task, titles!), currentTimeZone()),
          })
          .catch(noop);
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

  async function deliver(tasks: ReminderTaskInput[]): Promise<void> {
    if (!shell.sync) return;
    const titles = tasks.length > 0 ? await parentTitles() : EMPTY_TITLES;
    const plan = planReminderDeliveries(
      tasks,
      now(),
      { timeZone: currentTimeZone(), legacyDateTimeZone: currentLegacyDateTimeZone() },
      titles,
    );
    // 副本基准：原生据此判断这份计划与后台取回的 hub 计划谁更新（issue 09）。
    const [cursor, pending] = await Promise.all([engine.cursor(), engine.pendingCount()]);
    const basis = { cursor, pendingLocal: pending > 0 };
    // 基准进签名：推送清空 Outbox 后计划未变也要重新交付，原生才会恢复后台同步。
    const signature = JSON.stringify([plan, basis]);
    if (signature === lastSynced) return;
    try {
      await shell.sync(plan, basis);
      lastSynced = signature;
    } catch (error) {
      console.warn('[reminders] sync failed:', error);
    }
  }

  /** 文案上下文用的名称表：Project 名优先，其次 Area 名（仅在需要文案时读取）。 */
  async function parentTitles(): Promise<ReminderParentTitles> {
    const [projects, areas] = await Promise.all([engine.list('project'), engine.list('area')]);
    const titleOf = (rows: typeof projects) =>
      new Map(rows.map((row) => [row.id, (row.fields.title as string | undefined) ?? '']));
    return { projects: titleOf(projects), areas: titleOf(areas) };
  }

  async function applyAction(request: ReminderActionRequest): Promise<ReminderActionResolution> {
    const row = await engine.get('task', request.taskId);
    const resolution = resolveReminderAction(
      row ? reminderInputFromReplicaRow(row) : null,
      request,
      currentTimeZone(),
      currentLegacyDateTimeZone(),
    );
    if (resolution.kind === 'complete') {
      await tasksBackend.completeTask(request.taskId, { settledAt: resolution.settledAt });
    } else if (resolution.kind === 'snooze') {
      await tasksBackend.updateTask(request.taskId, {
        scheduledDate: resolution.scheduledDate,
        reminderTime: resolution.reminderTime,
      });
    }
    return resolution;
  }

  async function drainPendingActions(take: () => Promise<ReminderActionRequest[]>): Promise<void> {
    let actions: ReminderActionRequest[];
    try {
      actions = await take();
    } catch (error) {
      console.warn('[reminders] take pending actions failed:', error);
      return;
    }
    // 按点击顺序应用：同一任务先 Snooze 再对新通知点完成，快照依次吻合。
    for (const action of actions) {
      try {
        await applyAction(action);
      } catch (error) {
        console.warn('[reminders] apply action failed:', error);
      }
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
      if (mode === 'system' && shell.onActionsAvailable) {
        let stopped = false;
        void shell
          .onActionsAvailable(() => void reschedule())
          .then((off) => {
            if (stopped) off();
            else unsubscribeActions = off;
          })
          .catch(noop);
        unsubscribeActions = () => {
          stopped = true;
        };
      }
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
      unsubscribeActions?.();
      unsubscribeActions = null;
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
    async applyAction(request) {
      // 与重算同一串行链：写入与计划重算不交错；返回前等计划按写入结果
      // 重算完成（调用方随后看到的计划/已注册集一定已反映本次操作）。
      const result = chain.then(() => applyAction(request));
      chain = result.catch(noop);
      const resolution = await result;
      await reschedule();
      return resolution;
    },
  };
}
