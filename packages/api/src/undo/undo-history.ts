/**
 * Undo（撤销，对齐 Things 3：几乎所有编辑都能撤销，iPhone 上摇一摇撤销）。
 *
 * 记录点在 Engine 的写入口（create / update / updateMany / delete）：所有
 * 编辑都经各域 backend 落到这几个方法上，在这里记下每次写入的逆操作，
 * 不必逐个动作手写撤销逻辑。
 *
 * - **一步（Undo Step）**：两次用户输入（按下 / 点击 / 按键，见
 *   installUndoBoundaries）之间发起的全部写入。一个动作内部的多次写入
 *   （完成并派生重复实例、多选批量改期、拖拽整组）因此合成一步撤销。
 * - **逆操作**：update 记下被改字段的旧值；create 的逆是删除该条目
 *   （Delete Request）；删除 Subtask 的逆是按原字段重建（新 id）。
 * - **不可撤销**：其余物理删除（清空 Trash、删除区域 / 标签 / Heading /
 *   附件、转换为项目）无法还原，发生时清空撤销历史，免得更早的步骤
 *   作用在已不存在的条目上。
 * - **撤销**：逆序回写，只回写当前值仍等于当时写入值的字段（之后被别的
 *   编辑或其他设备改过的字段保持不动）；回写是普通的本地写入，照常同步。
 *
 * 不做重做（Redo）；撤销历史只在内存里，重启 / 登出即清空。
 */

import type { Engine, SyncEntity, WireRow } from '@taskora/engine';

/** 撤销确认里展示的动作名（i18n：common:undoAction.<action>）。 */
export type UndoAction =
  | 'create'
  | 'complete'
  | 'cancel'
  | 'reopen'
  | 'trash'
  | 'putBack'
  | 'move'
  | 'schedule'
  | 'deadline'
  | 'tags'
  | 'edit'
  | 'reorder'
  | 'change';

type InverseOp =
  | { kind: 'revert'; entity: SyncEntity; id: string; before: WireRow; after: WireRow }
  | { kind: 'remove'; entity: SyncEntity; id: string }
  | { kind: 'recreate'; entity: SyncEntity; fields: WireRow };

interface UndoStep {
  ops: InverseOp[];
  irreversible: boolean;
}

/** 物理删除后可按原字段重建的实体：叶子条目，没有别的条目引用它。 */
const RECREATABLE: ReadonlySet<SyncEntity> = new Set(['subtask']);

const OWNERSHIP_FIELDS = ['projectId', 'areaId', 'headingId', 'taskId'];
const SCHEDULE_FIELDS = ['scheduledDate', 'scheduledType', 'reminderTime', 'repeatRule'];
const ORDER_FIELDS = ['position', 'feedPosition'];
const SETTLED_STATUSES = ['COMPLETED', 'CANCELLED'];

export class UndoHistory {
  private engine: Engine | null = null;
  private steps: UndoStep[] = [];
  private current: UndoStep | null = null;
  /** 写入串行化：保证每次写入前读到的旧值是上一次写入之后的值。 */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly limit = 50) {}

  /** 接管一个 Engine：返回记录撤销的包装（交给各域 backend），历史清空。 */
  attach(engine: Engine): Engine {
    this.engine = engine;
    this.clear();
    return this.wrap(engine);
  }

  /** 停用（登出 / 关闭 Engine）：清空历史，之后的撤销请求为空操作。 */
  detach(): void {
    this.engine = null;
    this.clear();
  }

  clear(): void {
    this.steps = [];
    this.current = null;
  }

  /** 用户输入边界：此后的写入另起一步。 */
  boundary(): void {
    const step = this.current;
    if (!step) return;
    this.current = null;
    if (step.irreversible) {
      this.steps = [];
      return;
    }
    this.steps.push(step);
    if (this.steps.length > this.limit) this.steps.shift();
  }

  /** 最近一步可撤销的动作；没有则为 null。会先等进行中的写入记录完毕。 */
  async peek(): Promise<UndoAction | null> {
    await this.settle();
    const step = this.steps.at(-1);
    return step ? actionOf(step.ops) : null;
  }

  /** 撤销最近一步，返回其动作名；没有可撤销的则为 null。 */
  async undo(): Promise<UndoAction | null> {
    const engine = this.engine;
    await this.settle();
    const step = this.steps.pop();
    if (!engine || !step) return null;
    for (const op of [...step.ops].reverse()) {
      try {
        await applyInverse(engine, op);
      } catch {
        // 单条失败（条目已被别处删除等）不阻断其余逆操作。
      }
    }
    return actionOf(step.ops);
  }

  /** 收尾：等进行中的写入记录完毕、关闭当前步，丢掉没有任何逆操作的步。 */
  private async settle(): Promise<void> {
    await this.queue;
    this.boundary();
    while (this.steps.length > 0 && this.steps.at(-1)!.ops.length === 0) this.steps.pop();
  }

  private stepForWrite(): UndoStep {
    this.current ??= { ops: [], irreversible: false };
    return this.current;
  }

  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private wrap(engine: Engine): Engine {
    const recordUpdate = async (step: UndoStep, entity: SyncEntity, id: string, patch: WireRow) => {
      const row = await engine.get(entity, id);
      if (!row) return;
      const before: WireRow = {};
      const after: WireRow = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        before[key] = row.fields[key] ?? null;
        after[key] = value;
      }
      step.ops.push({ kind: 'revert', entity, id, before, after });
    };

    const writes: Pick<Engine, 'create' | 'update' | 'updateMany' | 'delete'> = {
      create: (entity, values) => {
        const step = this.stepForWrite();
        return this.serialize(async () => {
          const id = await engine.create(entity, values);
          step.ops.push({ kind: 'remove', entity, id });
          return id;
        });
      },
      update: (entity, id, patch) => {
        const step = this.stepForWrite();
        return this.serialize(async () => {
          await recordUpdate(step, entity, id, patch);
          await engine.update(entity, id, patch);
        });
      },
      updateMany: (entity, patches) => {
        const step = this.stepForWrite();
        return this.serialize(async () => {
          for (const { id, patch } of patches) await recordUpdate(step, entity, id, patch);
          await engine.updateMany(entity, patches);
        });
      },
      delete: (entity, ids) => {
        const step = this.stepForWrite();
        return this.serialize(async () => {
          if (RECREATABLE.has(entity)) {
            for (const id of ids) {
              const row = await engine.get(entity, id);
              if (row) step.ops.push({ kind: 'recreate', entity, fields: { ...row.fields } });
            }
          } else {
            step.irreversible = true;
          }
          await engine.delete(entity, ids);
        });
      },
    };

    return new Proxy(engine, {
      get(target, prop) {
        if (Object.prototype.hasOwnProperty.call(writes, prop)) {
          return writes[prop as keyof typeof writes];
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
}

async function applyInverse(engine: Engine, op: InverseOp): Promise<void> {
  switch (op.kind) {
    case 'revert': {
      const row = await engine.get(op.entity, op.id);
      if (!row) return;
      const patch: WireRow = {};
      for (const [key, value] of Object.entries(op.before)) {
        // 之后又被改过（本机别的编辑或其他设备）的字段不动。
        if (sameValue(row.fields[key], op.after[key])) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) await engine.update(op.entity, op.id, patch);
      return;
    }
    case 'remove':
      if (await engine.get(op.entity, op.id)) await engine.delete(op.entity, [op.id]);
      return;
    case 'recreate':
      await engine.create(op.entity, op.fields);
      return;
  }
}

/** wire 值比较：JSON 字段（repeatRule、tagIds 等）按键排序后比较。 */
function sameValue(a: unknown, b: unknown): boolean {
  return stableJson(a ?? null) === stableJson(b ?? null);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}

/** 一步撤销的动作名：按「最能代表这一步」的优先级取第一个命中的。 */
export function actionOf(ops: readonly InverseOp[]): UndoAction {
  const reverts = ops.flatMap((op) => (op.kind === 'revert' ? [op] : []));
  const changed = (keys: string[]) =>
    reverts.some((op) =>
      keys.some((key) => key in op.after && !sameValue(op.before[key], op.after[key])),
    );

  for (const op of reverts) {
    if (!('status' in op.after) || sameValue(op.before.status, op.after.status)) continue;
    if (op.after.status === 'COMPLETED') return 'complete';
    if (op.after.status === 'CANCELLED') return 'cancel';
    if (SETTLED_STATUSES.includes(op.before.status as string)) return 'reopen';
  }
  for (const op of reverts) {
    if (!('trashedAt' in op.after) || sameValue(op.before.trashedAt, op.after.trashedAt)) continue;
    return op.after.trashedAt == null ? 'putBack' : 'trash';
  }
  if (ops.some((op) => op.kind === 'remove')) return 'create';
  if (ops.some((op) => op.kind === 'recreate')) return 'trash';
  if (changed(OWNERSHIP_FIELDS)) return 'move';
  if (changed(SCHEDULE_FIELDS)) return 'schedule';
  if (changed(['dueDate'])) return 'deadline';
  if (changed(['tagIds'])) return 'tags';
  if (changed(['title', 'notes'])) return 'edit';
  if (changed(ORDER_FIELDS)) return 'reorder';
  return 'change';
}

/** 全应用唯一的撤销历史（Engine 由各端 boot 时经 attach 接入）。 */
export const undoHistory = new UndoHistory();

/**
 * 以用户输入划分撤销步骤：捕获阶段监听按下、点击与按键，每次输入前关闭
 * 当前步。返回卸载函数。
 */
export function installUndoBoundaries(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  history: UndoHistory = undoHistory,
): () => void {
  const onInput = () => history.boundary();
  const events = ['pointerdown', 'click', 'keydown'] as const;
  for (const type of events) target.addEventListener(type, onInput, true);
  return () => {
    for (const type of events) target.removeEventListener(type, onInput, true);
  };
}
