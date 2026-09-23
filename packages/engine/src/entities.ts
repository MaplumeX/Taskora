/**
 * 同步实体注册表 — Engine SQL schema 的唯一事实来源。
 *
 * 字段名与 hub 侧 Prisma schema 的列名一致（契约测试对齐两端，ADR-0007）。
 * wire 上的值一律 JSON 可序列化：日期为 ISO 字符串、枚举为字符串、
 * tagIds 为字符串数组（hub 侧由关系表物化）。
 *
 * `position` 是 Task/Project/Tag 的排序位次（fractional indexing 字符串，
 * CONTEXT.md「引擎与同步」）；`sortOrder` 是过渡期保留的旧 REST 排序列。
 */

export type SyncEntity =
  'task' | 'subtask' | 'project' | 'project-heading' | 'area' | 'tag' | 'tag-group';

export type SqlColumnType = 'TEXT' | 'INTEGER';

export interface FieldDef {
  name: string;
  /** SQLite 列类型。 */
  sql: SqlColumnType;
  /** 可为 null 的字段。 */
  nullable: boolean;
  /** 以 JSON 文本存储（如 tagIds）。 */
  json?: boolean;
}

export interface EntityDef {
  name: SyncEntity;
  /** SQLite 表名（与实体名一致，kebab → snake）。 */
  table: string;
  /** wire 字段（不含 id 与 clocks）。 */
  fields: FieldDef[];
  /** fractional indexing 排序字段（有则 list 按其排序）。 */
  orderField?: string;
}

const f = (name: string, opts: Partial<FieldDef> = {}): FieldDef => ({
  name,
  sql: 'TEXT',
  nullable: true,
  ...opts,
});

export const ENTITIES: Record<SyncEntity, EntityDef> = {
  task: {
    name: 'task',
    table: 'task',
    orderField: 'position',
    fields: [
      f('title'),
      f('notes'),
      f('scheduledDate'),
      f('dueDate'),
      f('reminderTime'),
      f('bucket'),
      f('scheduledType'),
      f('status'),
      f('settledAt'),
      f('trashedAt'),
      f('position'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('projectId'),
      f('headingId'),
      f('areaId'),
      f('tagIds', { json: true }),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  subtask: {
    name: 'subtask',
    table: 'subtask',
    fields: [
      f('title'),
      f('status'),
      f('settledAt'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('taskId'),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  project: {
    name: 'project',
    table: 'project',
    orderField: 'position',
    fields: [
      f('title'),
      f('notes'),
      f('status'),
      f('bucket'),
      f('scheduledType'),
      f('scheduledDate'),
      f('dueDate'),
      f('completedAt'),
      f('trashedAt'),
      f('position'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('areaId'),
      f('tagIds', { json: true }),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  'project-heading': {
    name: 'project-heading',
    table: 'project_heading',
    fields: [
      f('title'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('status'),
      f('completedAt'),
      f('projectId'),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  area: {
    name: 'area',
    table: 'area',
    fields: [
      f('title'),
      f('notes'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('tagIds', { json: true }),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  tag: {
    name: 'tag',
    table: 'tag',
    orderField: 'position',
    fields: [
      f('title'),
      f('color'),
      f('position'),
      f('sortOrder', { sql: 'INTEGER' }),
      f('tagGroupId'),
      f('createdAt'),
      f('updatedAt'),
    ],
  },
  'tag-group': {
    name: 'tag-group',
    table: 'tag_group',
    fields: [f('title'), f('sortOrder', { sql: 'INTEGER' }), f('createdAt'), f('updatedAt')],
  },
};

export const SYNC_ENTITIES: SyncEntity[] = Object.keys(ENTITIES) as SyncEntity[];

/**
 * 删除级联（ADR-0008）：删除 Task 时级联删除其 Subtask（对齐 hub 侧
 * onDelete: Cascade）。设备侧与 hub 侧适用同一条规则，孤儿 Subtask
 * 不残留在任何副本。
 */
export const DELETE_CASCADES: Partial<
  Record<SyncEntity, Array<{ entity: SyncEntity; foreignKey: string }>>
> = {
  task: [{ entity: 'subtask', foreignKey: 'taskId' }],
  // Project 物理删除时级联其 ProjectHeading（对齐 Prisma onDelete:
  // Cascade）。hub 侧 DB 级联不产生事件，副本靠本表在收到 project
  // Compact Event 时本地级联，否则孤儿 heading 永久残留副本。
  project: [{ entity: 'project-heading', foreignKey: 'projectId' }],
};

/**
 * Compact 引用清理（ADR-0008）：某实体被 compact 后，将其在其它实体上
 * 的引用字段置 null（对齐 hub 侧 onDelete: SetNull）。仅做本地副本清理，
 * 不携带新时钟——字段级 LWW 仍由真正的字段写裁决，不会以清理写压掉
 * 他人后来的真实编辑。
 */
export const COMPACT_NULL_REFS: Partial<
  Record<SyncEntity, Array<{ entity: SyncEntity; field: string }>>
> = {
  area: [
    { entity: 'task', field: 'areaId' },
    { entity: 'project', field: 'areaId' },
  ],
  'project-heading': [{ entity: 'task', field: 'headingId' }],
  'tag-group': [{ entity: 'tag', field: 'tagGroupId' }],
  // Task.project 是可选关系，Prisma 默认 onDelete: SetNull——hub 删除
  // project 时 DB 自动置 null；副本按同一语义清理（emptyTrash 场景下
  // 下属 task 本就同批删除，此条为防御性对齐）。
  project: [{ entity: 'task', field: 'projectId' }],
};

/**
 * 引用字段注册表 — hub 合并前的失效引用清洗（同步毒丸防御）。
 *
 * 设备离线期间的写可能引用此后被物理删除（compact）的实体：hub 直接
 * 物化会触发 FK violation，整个 push 批次反复失败（毒丸）。合并后按本
 * 表清洗 applied 字段：数组引用剔除失效 id、标量引用置 null（对齐
 * compact 的 SetNull 语义）；Subtask.taskId 失效则整事件丢弃（孤儿
 * 防御）。两端 hub（NestJS SyncHubService / InMemorySyncHub）共用。
 */
export const REFERENCE_FIELDS: Partial<
  Record<SyncEntity, Record<string, { entity: SyncEntity; array?: boolean }>>
> = {
  task: {
    tagIds: { entity: 'tag', array: true },
    projectId: { entity: 'project' },
    headingId: { entity: 'project-heading' },
    areaId: { entity: 'area' },
  },
  project: {
    tagIds: { entity: 'tag', array: true },
    areaId: { entity: 'area' },
  },
  area: { tagIds: { entity: 'tag', array: true } },
  tag: { tagGroupId: { entity: 'tag-group' } },
  subtask: { taskId: { entity: 'task' } },
};

export function entityDef(entity: SyncEntity): EntityDef {
  return ENTITIES[entity];
}

export function isSyncEntity(value: string): value is SyncEntity {
  return Object.prototype.hasOwnProperty.call(ENTITIES, value);
}

/** wire 上的实体行（不含 id / clocks）。 */
export type WireRow = Record<string, unknown>;

/** 生成建表 DDL（含 meta / outbox 表）。 */
export function schemaDdl(): string[] {
  const statements: string[] = [];
  for (const entity of SYNC_ENTITIES) {
    const def = ENTITIES[entity];
    const columns = [
      'id TEXT PRIMARY KEY',
      ...def.fields.map((field) =>
        field.json ? `${field.name} TEXT` : `${field.name} ${field.sql}`,
      ),
      "clocks TEXT NOT NULL DEFAULT '{}'",
    ];
    statements.push(`CREATE TABLE IF NOT EXISTS ${def.table} (${columns.join(', ')})`);
  }
  statements.push(
    'CREATE TABLE IF NOT EXISTS _engine_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS _outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL DEFAULT 'write',
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      fields TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    )`,
  );
  return statements;
}
