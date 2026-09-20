/**
 * Local Replica（本地副本）— 每台设备持有的该用户全量数据镜像，
 * UI 读写的直接对象（CONTEXT.md「引擎与同步」）。不可视为可随时丢弃
 * 的缓存：断网时它是 Outbox 中未同步编辑的唯一载体。
 *
 * 职责：
 * - 实体行的存取（SQLite schema 见 entities.ts）；
 * - 本地写：字段打 HLC 时间戳、落库、进 Outbox（可合并同类 pending）；
 * - 远端写：按字段级 LWW 合并拉取的变更（同 hub 的合并器）；
 * - Compact Event：物理移除实体行；
 * - 快照重建（bootstrap）：整表替换、保留未同步 Outbox；
 * - 变更通知：任何本地/应用远端写都推进版本号、通知订阅者。
 */

import { entityDef, schemaDdl, SYNC_ENTITIES, type SyncEntity, type WireRow } from './entities';
import { HybridClock } from './hlc';
import { mergeEntityState, type EntityMergeState, type FieldWrite } from './merger';
import type { OutboxEvent, SnapshotEntry } from './protocol';
import { inTransaction, type SqlStorage } from './storage';

export interface ReplicaRow {
  id: string;
  fields: WireRow;
}

export interface LocalReplicaOptions {
  deviceId: string;
  clock?: HybridClock;
  /** id 生成器（测试确定性）。 */
  generateId?: () => string;
}

export class LocalReplica {
  private readonly clock: HybridClock;
  private readonly generateId: () => string;
  private listeners = new Set<() => void>();
  private changeVersion = 0;

  constructor(
    private readonly storage: SqlStorage,
    private readonly options: LocalReplicaOptions,
  ) {
    this.clock = options.clock ?? new HybridClock(options.deviceId);
    this.generateId =
      options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  // ---------- 生命周期 ----------

  /** 建表 + 恢复持久化的 HLC 状态。 */
  init(): void {
    for (const statement of schemaDdl()) {
      this.storage.exec(statement);
    }
    const saved = this.metaGet('hlc');
    if (saved) {
      const state = JSON.parse(saved) as { wallMs: number; counter: number };
      this.clock.restoreState(state);
    }
  }

  get deviceId(): string {
    return this.options.deviceId;
  }

  getCursor(): number {
    return Number(this.metaGet('syncCursor') ?? '0');
  }

  setCursor(seq: number): void {
    this.metaSet('syncCursor', String(seq));
  }

  /** 数据变更版本号（订阅失效用）。 */
  get version(): number {
    return this.changeVersion;
  }

  /** 订阅数据变更；返回退订函数。 */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyChanged(): void {
    this.changeVersion += 1;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // 订阅者异常不得破坏写路径
      }
    }
  }

  // ---------- 读 ----------

  /** 实体合并态（字段 + 时钟），不存在返回 null。 */
  get(entity: SyncEntity, id: string): EntityMergeState | null {
    const def = entityDef(entity);
    const row = this.storage.all<Record<string, unknown>>(
      `SELECT * FROM ${def.table} WHERE id = ?`,
      [id],
    )[0];
    return row ? this.rowToState(entity, row) : null;
  }

  /** 全量实体行（UI 查询面），按 Position / sortOrder 排序。 */
  list(entity: SyncEntity): ReplicaRow[] {
    const def = entityDef(entity);
    const order =
      def.orderField === 'position'
        ? 'ORDER BY position IS NULL ASC, position ASC, createdAt DESC'
        : 'ORDER BY sortOrder ASC, createdAt DESC';
    const rows = this.storage.all<Record<string, unknown>>(
      `SELECT * FROM ${def.table} ${order}`,
    );
    return rows.map((row) => {
      const { id, clocks: _clocks, ...rest } = row;
      return { id: id as string, fields: this.decodeRow(entity, rest) };
    });
  }

  // ---------- 本地写 ----------

  /**
   * 创建实体：未显式提供的字段取 null（tagIds 为 []），
   * createdAt/updatedAt 缺省为当前时间。每个字段打 HLC 时间戳并进 Outbox。
   */
  create(entity: SyncEntity, values: WireRow): string {
    const def = entityDef(entity);
    const id = typeof values.id === 'string' ? values.id : this.generateId();
    const nowIso = new Date().toISOString();
    const fields: WireRow = {};
    for (const field of def.fields) {
      const provided = values[field.name];
      if (provided !== undefined) {
        fields[field.name] = provided;
      } else if (field.json) {
        fields[field.name] = [];
      } else if (field.name === 'createdAt' || field.name === 'updatedAt') {
        fields[field.name] = nowIso;
      } else {
        fields[field.name] = null;
      }
    }
    const writes: Record<string, FieldWrite> = {};
    const clocks: Record<string, string> = {};
    for (const field of def.fields) {
      const hlc = this.stamp();
      writes[field.name] = { value: fields[field.name], hlc };
      clocks[field.name] = hlc;
    }
    inTransaction(this.storage, () => {
      this.writeRow(entity, id, fields, clocks, { insert: true });
      this.appendOutbox(entity, id, writes);
    });
    this.notifyChanged();
    return id;
  }

  /**
   * 更新实体字段：每个字段打上新的 HLC 时间戳，落库并进 Outbox。
   * updatedAt 自动推进（除非补丁显式给出）。
   */
  update(entity: SyncEntity, id: string, patch: WireRow): void {
    const def = entityDef(entity);
    const current = this.get(entity, id);
    if (!current) {
      throw new Error(`update: ${entity} ${id} 不存在`);
    }
    const effective = { ...patch };
    if (effective.updatedAt === undefined) {
      effective.updatedAt = new Date().toISOString();
    }
    const writes: Record<string, FieldWrite> = {};
    const clocks: Record<string, string> = { ...current.clocks };
    const fields: WireRow = { ...current.fields };
    for (const field of def.fields) {
      const value = effective[field.name];
      if (value === undefined) continue;
      const hlc = this.stamp();
      fields[field.name] = value;
      clocks[field.name] = hlc;
      writes[field.name] = { value, hlc };
    }
    inTransaction(this.storage, () => {
      this.writeRow(entity, id, fields, clocks, { insert: false });
      this.appendOutbox(entity, id, writes);
    });
    this.notifyChanged();
  }

  // ---------- 远端写（pull / bootstrap 应用） ----------

  /**
   * 应用一个远端实体变更（字段级 LWW）。返回是否产生了本地变更。
   * 自身回声（时间戳相同）幂等无操作。
   */
  applyRemoteEntity(entity: SyncEntity, id: string, remote: EntityMergeState): boolean {
    const current = this.get(entity, id);
    const outcome = mergeEntityState(current, remote);
    if (outcome.appliedFields.length === 0) return false;
    inTransaction(this.storage, () => {
      this.writeRow(entity, id, outcome.fields, outcome.clocks, {
        insert: current === null,
      });
    });
    this.notifyChanged();
    return true;
  }

  /** 应用 Compact Event：从副本物理移除一批实体。 */
  applyCompact(entity: SyncEntity, ids: string[]): boolean {
    const def = entityDef(entity);
    let removed = 0;
    inTransaction(this.storage, () => {
      for (const id of ids) {
        const { changes } = this.storage.run(`DELETE FROM ${def.table} WHERE id = ?`, [id]);
        removed += changes;
      }
    });
    if (removed > 0) this.notifyChanged();
    return removed > 0;
  }

  /**
   * 快照重建：整表替换为 hub 的合并态。Outbox 保留——未同步的本地写
   * 之后照常 flush 推给 hub，时间戳新者胜，最终收敛。重建后立即把
   * Outbox 中的写重新落回本地，未同步编辑不会从 UI 上消失。
   */
  replaceAll(snapshot: SnapshotEntry[]): void {
    inTransaction(this.storage, () => {
      for (const entity of SYNC_ENTITIES) {
        this.storage.exec(`DELETE FROM ${entityDef(entity).table}`);
      }
      for (const entry of snapshot) {
        this.writeRow(entry.entity, entry.id, entry.fields, entry.clocks, { insert: true });
        this.absorbRemoteClocks(entry.clocks);
      }
    });
    // Outbox 回放：本地合并（不重新打时间戳，保留原 HLC）
    const pending = this.takeOutbox(Number.MAX_SAFE_INTEGER);
    for (const { event } of pending) {
      const current = this.get(event.entity, event.id);
      const remote: EntityMergeState = {
        fields: Object.fromEntries(
          Object.entries(event.fields).map(([field, write]) => [field, write.value]),
        ),
        clocks: Object.fromEntries(
          Object.entries(event.fields).map(([field, write]) => [field, write.hlc]),
        ),
      };
      const outcome = mergeEntityState(current, remote);
      this.writeRow(event.entity, event.id, outcome.fields, outcome.clocks, {
        insert: current === null,
      });
    }
    this.notifyChanged();
  }

  // ---------- Outbox ----------

  /** 取待推送的 Change Events（按入队顺序）。 */
  takeOutbox(limit = 500): Array<{ rowId: number; event: OutboxEvent }> {
    const rows = this.storage.all<{
      id: number;
      entity: string;
      entity_id: string;
      fields: string;
    }>('SELECT id, entity, entity_id, fields FROM _outbox ORDER BY id ASC LIMIT ?', [limit]);
    return rows.map((row) => ({
      rowId: row.id,
      event: {
        entity: row.entity as SyncEntity,
        id: row.entity_id,
        fields: JSON.parse(row.fields) as Record<string, FieldWrite>,
      },
    }));
  }

  outboxCount(): number {
    const row = this.storage.all<{ count: number }>('SELECT COUNT(*) AS count FROM _outbox')[0];
    return row?.count ?? 0;
  }

  /** flush 成功后按行号删除（部分失败可重试）。 */
  deleteOutbox(rowIds: number[]): void {
    for (const rowId of rowIds) {
      this.storage.run('DELETE FROM _outbox WHERE id = ?', [rowId]);
    }
  }

  // ---------- 内部 ----------

  /**
   * 吸收远端时钟：拉取过远端变更的设备再发号时必然晚于已见过的最大
   * 远端时间戳（HLC 因果性），避免同墙钟设备被旧基线压掉。
   */
  private absorbRemoteClocks(clocks: Record<string, string>): void {
    let max: string | null = null;
    for (const stamp of Object.values(clocks)) {
      if (max === null || stamp > max) max = stamp;
    }
    if (max !== null) {
      this.clock.receive(max);
      this.metaSet('hlc', JSON.stringify(this.clock.getState()));
    }
  }

  private stamp(): string {
    const stamp = this.clock.now();
    // HLC 状态持久化：跨会话时间戳不回退（否则同设备可能发出重复时间戳）
    this.metaSet('hlc', JSON.stringify(this.clock.getState()));
    return stamp;
  }

  private metaGet(key: string): string | null {
    const row = this.storage.all<{ value: string }>(
      'SELECT value FROM _engine_meta WHERE key = ?',
      [key],
    )[0];
    return row?.value ?? null;
  }

  private metaSet(key: string, value: string): void {
    this.storage.run(
      'INSERT INTO _engine_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  private rowToState(entity: SyncEntity, row: Record<string, unknown>): EntityMergeState {
    const { id: _id, clocks, ...rest } = row;
    return {
      fields: this.decodeRow(entity, rest),
      clocks: JSON.parse((clocks as string) ?? '{}'),
    };
  }

  private decodeRow(entity: SyncEntity, row: Record<string, unknown>): WireRow {
    const def = entityDef(entity);
    const fields: WireRow = {};
    for (const field of def.fields) {
      const value = row[field.name];
      fields[field.name] = field.json && typeof value === 'string' ? JSON.parse(value) : value;
    }
    return fields;
  }

  private writeRow(
    entity: SyncEntity,
    id: string,
    fields: WireRow,
    clocks: Record<string, string>,
    opts: { insert: boolean },
  ): void {
    const def = entityDef(entity);
    const columns: unknown[] = [];
    const placeholders: string[] = [];
    for (const field of def.fields) {
      const value = fields[field.name] ?? null;
      columns.push(field.json ? JSON.stringify(value ?? null) : value);
      placeholders.push('?');
    }
    const allColumns = ['id', ...def.fields.map((field) => field.name), 'clocks'];
    const allValues: unknown[] = [
      id,
      ...columns,
      JSON.stringify(clocks),
    ];
    if (opts.insert) {
      this.storage.run(
        `INSERT OR REPLACE INTO ${def.table} (${allColumns.join(', ')}) VALUES (${allColumns
          .map(() => '?')
          .join(', ')})`,
        allValues,
      );
    } else {
      const assignments = allColumns.slice(1).map((column) => `${column} = ?`);
      this.storage.run(
        `UPDATE ${def.table} SET ${assignments.join(', ')} WHERE id = ?`,
        [...allValues.slice(1), id],
      );
    }
  }

  /**
   * 追加 Outbox。同类 pending（同实体同 id）就地合并：后写覆盖先写
   * 的同字段条目（时间戳必然更新），控制重放体积。
   */
  private appendOutbox(
    entity: SyncEntity,
    id: string,
    writes: Record<string, FieldWrite>,
  ): void {
    if (Object.keys(writes).length === 0) return;
    const existing = this.storage.all<{ id: number; fields: string }>(
      'SELECT id, fields FROM _outbox WHERE entity = ? AND entity_id = ? ORDER BY id DESC',
      [entity, id],
    )[0];
    if (existing) {
      const merged = {
        ...(JSON.parse(existing.fields) as Record<string, FieldWrite>),
        ...writes,
      };
      this.storage.run('UPDATE _outbox SET fields = ? WHERE id = ?', [
        JSON.stringify(merged),
        existing.id,
      ]);
      return;
    }
    this.storage.run('INSERT INTO _outbox (entity, entity_id, fields) VALUES (?, ?, ?)', [
      entity,
      id,
      JSON.stringify(writes),
    ]);
  }
}
