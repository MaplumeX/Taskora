/**
 * Local Replica 的 schema 版本与迁移（local-first-v3 issue 03）。
 *
 * 版本号记在 SQLite 的 `PRAGMA user_version`。打开副本时：
 * - 新库（没有任何 Engine 表）：直接按当前 DDL 建表，版本记为最新；
 * - 旧库：从记录的版本起顺序执行迁移，每步一个事务，版本号与该步的
 *   改动一起提交——中途崩溃重开时从失败的那一步重来；
 * - 版本比代码新（降级安装）：拒绝打开，抛 ReplicaSchemaTooNewError。
 *   旧代码不认识新 schema 的语义，继续读写会把数据写坏。
 *
 * 规则：
 * - 迁移只追加、不修改已发布的步骤；新增列 / 表同时改 entities.ts 的
 *   DDL（新库）并追加一步迁移（旧库）。
 * - 版本号出现之前的安装（user_version 为 0）列集合各不相同：第 1 步
 *   补齐缺失的表，之后的加列步骤用 addColumnIfMissing，对「DDL 已带该列」
 *   的库是空操作。以后的加列也沿用它，保证每步可重入。
 * - 数据迁移（改值而非加列）同样写成一步，拿到的是事务内的 storage。
 */

import { ENTITIES, entityTableDdl, schemaDdl } from './entities';
import { DEFAULT_TAG_COLOR } from './domain/tags';
import { synthPosition } from './position';
import { inTransaction, type SqlStorage } from './storage';

export type ReplicaMigration = (storage: SqlStorage) => Promise<void>;

const ENTITY_TABLES = Object.values(ENTITIES).map((def) => def.table);

/**
 * sortOrder 时代（7 → 9）的实体表。已发布的步骤按当时的表集合运行，
 * 不随注册表变化：tag_group 在 10 → 11 才退役。
 */
const SORT_ORDER_ERA_TABLES = [...ENTITY_TABLES, 'tag_group'];

/** 副本迁移完成、等待在协议 5 的 hub 上做一次 bootstrap（_engine_meta 键）。 */
export const TAG_TREE_RESYNC_META_KEY = 'tagTreeResync';

/**
 * 副本加了 attachment 表、等待在协议 6 的 hub 上做一次 bootstrap
 * （_engine_meta 键）：旧版本跳过了 hub 下发的 attachment 变更。
 */
export const ATTACHMENT_RESYNC_META_KEY = 'attachmentResync';

async function tableExists(storage: SqlStorage, table: string): Promise<boolean> {
  const rows = await storage.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table],
  );
  return rows.length > 0;
}

async function columnNames(storage: SqlStorage, table: string): Promise<string[]> {
  const columns = await storage.all<{ name: string }>(
    `SELECT name FROM pragma_table_info('${table}')`,
  );
  return columns.map((row) => row.name);
}

async function addColumnIfMissing(
  storage: SqlStorage,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  // 已退役的表（tag_group）在第 1 步按当前 DDL 补建时不会出现
  if (!(await tableExists(storage, table))) return;
  if (!(await columnNames(storage, table)).includes(column)) {
    await storage.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * 7 → 8：Area / ProjectHeading / TagGroup / Subtask 增加 position；全部实体
 * 中仍为空的 position 按 hub 下发 legacy 行的同一口径（synthPosition(
 * sortOrder, createdAt)）填充（retire-sort-order issue 02 / 03）。值与 hub
 * 的 wire 视图逐字相同，不写时钟、不入 Outbox。
 */
async function addPositionToSortOrderEntities(storage: SqlStorage): Promise<void> {
  for (const table of ['subtask', 'project_heading', 'area', 'tag_group']) {
    await addColumnIfMissing(storage, table, 'position', 'TEXT');
  }
  for (const table of SORT_ORDER_ERA_TABLES) {
    if (!(await tableExists(storage, table))) continue;
    // 第 1 步按当前 DDL 补建的表没有 sortOrder 列（协议 4 起注册表不含它）
    const hasSortOrder = (await columnNames(storage, table)).includes('sortOrder');
    const rows = await storage.all<{
      id: string;
      sortOrder: number | null;
      createdAt: string | null;
    }>(
      `SELECT id, ${hasSortOrder ? 'sortOrder' : 'NULL AS sortOrder'}, createdAt FROM ${table} WHERE position IS NULL`,
    );
    for (const row of rows) {
      const createdMs = row.createdAt ? Date.parse(row.createdAt) : NaN;
      const position = synthPosition(
        typeof row.sortOrder === 'number' ? row.sortOrder : 0,
        new Date(Number.isNaN(createdMs) ? 0 : createdMs),
      );
      await storage.run(`UPDATE ${table} SET position = ? WHERE id = ?`, [position, row.id]);
    }
  }
}

/**
 * 8 → 9：删除 sortOrder 列（retire-sort-order issue 05）。协议 4 起它不在
 * 注册表里，7 → 8 已用它填好 position；第 1 步补建的表本来就没有它。
 */
async function dropSortOrder(storage: SqlStorage): Promise<void> {
  for (const table of SORT_ORDER_ERA_TABLES) {
    if ((await columnNames(storage, table)).includes('sortOrder')) {
      await storage.exec(`ALTER TABLE ${table} DROP COLUMN sortOrder`);
    }
  }
}

async function createMissingTables(storage: SqlStorage): Promise<void> {
  // 当前 DDL 的索引引用 tag.parentId：已有的旧 tag 表先补列（10 → 11 再把
  // tagGroupId 迁过来）
  await addColumnIfMissing(storage, 'tag', 'parentId', 'TEXT');
  for (const statement of schemaDdl()) await storage.exec(statement);
}

/**
 * 10 → 11：Tag Group 退役，改为嵌套 Tag（ADR-0016）。规则与 hub 的
 * Prisma 迁移逐字相同，两端各自转换后无需同步就一致：
 * - 每个 Tag Group 转成同 id 的顶层 Tag：标题、位次、时间戳与它们的时钟
 *   原样保留，颜色取默认色（无时钟）；
 * - 成员 Tag 的 tagGroupId 改为 parentId（值与时钟键都改名）；
 * - Outbox 与 Compact 登记里的 tag-group 改为 tag、tagGroupId 改为 parentId。
 * 最后记下「需要一次 bootstrap」：设备先于 hub 升级时，期间旧 hub 下发的
 * tag-group 事件被跳过，连上协议 5 的 hub 后整体重取一次收敛。
 */
async function nestTagGroups(storage: SqlStorage): Promise<void> {
  await addColumnIfMissing(storage, 'tag', 'parentId', 'TEXT');
  if ((await columnNames(storage, 'tag')).includes('tagGroupId')) {
    const members = await storage.all<{ id: string; tagGroupId: string | null; clocks: string }>(
      'SELECT id, tagGroupId, clocks FROM tag WHERE tagGroupId IS NOT NULL OR clocks LIKE \'%"tagGroupId"%\'',
    );
    for (const row of members) {
      const clocks = JSON.parse(row.clocks || '{}') as Record<string, string>;
      if ('tagGroupId' in clocks) {
        clocks.parentId = clocks.tagGroupId;
        delete clocks.tagGroupId;
      }
      await storage.run('UPDATE tag SET parentId = ?, clocks = ? WHERE id = ?', [
        row.tagGroupId,
        JSON.stringify(clocks),
        row.id,
      ]);
    }
    await storage.exec('DROP INDEX IF EXISTS tag_group_member');
    await storage.exec('ALTER TABLE tag DROP COLUMN tagGroupId');
  }
  if (await tableExists(storage, 'tag_group')) {
    const groups = await storage.all<{
      id: string;
      title: string | null;
      position: string | null;
      createdAt: string | null;
      updatedAt: string | null;
      clocks: string;
    }>('SELECT id, title, position, createdAt, updatedAt, clocks FROM tag_group');
    for (const group of groups) {
      await storage.run(
        `INSERT OR IGNORE INTO tag (id, title, color, position, parentId, createdAt, updatedAt, clocks)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          group.id,
          group.title,
          DEFAULT_TAG_COLOR,
          group.position,
          group.createdAt,
          group.updatedAt,
          group.clocks || '{}',
        ],
      );
    }
    await storage.exec('DROP TABLE tag_group');
  }

  const pending = await storage.all<{ id: number; entity: string; fields: string }>(
    "SELECT id, entity, fields FROM _outbox WHERE entity IN ('tag', 'tag-group')",
  );
  for (const row of pending) {
    const fields = JSON.parse(row.fields || '{}') as Record<string, unknown>;
    if ('tagGroupId' in fields) {
      fields.parentId = fields.tagGroupId;
      delete fields.tagGroupId;
    }
    await storage.run("UPDATE _outbox SET entity = 'tag', fields = ? WHERE id = ?", [
      JSON.stringify(fields),
      row.id,
    ]);
  }
  await storage.run(
    "INSERT OR IGNORE INTO _compacted (entity, entity_id, registered_at) SELECT 'tag', entity_id, registered_at FROM _compacted WHERE entity = 'tag-group'",
  );
  await storage.run("DELETE FROM _compacted WHERE entity = 'tag-group'");

  await storage.exec('CREATE INDEX IF NOT EXISTS tag_parent ON tag (parentId)');
  await storage.run(
    'INSERT INTO _engine_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [TAG_TREE_RESYNC_META_KEY, '1'],
  );
}

/**
 * 11 → 12：attachment 表与索引（ADR-0019）。旧版本收到 attachment 变更时
 * 按「不认识的实体」跳过，迁移后记下「需要一次 bootstrap」把它们取回。
 */
async function addAttachments(storage: SqlStorage): Promise<void> {
  await storage.exec(entityTableDdl('attachment'));
  await storage.exec('CREATE INDEX IF NOT EXISTS attachment_task ON attachment (taskId)');
  await storage.run(
    'INSERT INTO _engine_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [ATTACHMENT_RESYNC_META_KEY, '1'],
  );
}

/**
 * 迁移步骤：下标 i 把副本从版本 i 升到 i + 1。
 * 只追加；已发布的步骤不可修改。
 */
export const REPLICA_MIGRATIONS: readonly ReplicaMigration[] = [
  // 0 → 1：版本号之前的安装。补齐缺失的实体表、Outbox、Compact 登记与索引。
  createMissingTables,
  // 1 → 2：Outbox 增加 kind（Delete Request，ADR-0008）与 revision 列。
  async (storage) => {
    await addColumnIfMissing(storage, '_outbox', 'kind', "TEXT NOT NULL DEFAULT 'write'");
    await addColumnIfMissing(storage, '_outbox', 'revision', 'INTEGER NOT NULL DEFAULT 0');
  },
  // 2 → 3：task 增加 reminderTime（reminders spec）。
  (storage) => addColumnIfMissing(storage, 'task', 'reminderTime', 'TEXT'),
  // 3 → 4：task 增加 repeatRule（recurring-tasks spec，JSON 文本）。
  (storage) => addColumnIfMissing(storage, 'task', 'repeatRule', 'TEXT'),
  // 4 → 5：Compact 登记增加本机登记时刻（local-first-v3 issue 08，过期
  // 清理）。已有登记按迁移时刻计，从现在起再保留一个完整保留期。
  async (storage) => {
    await addColumnIfMissing(storage, '_compacted', 'registered_at', 'INTEGER NOT NULL DEFAULT 0');
    await storage.run('UPDATE _compacted SET registered_at = ? WHERE registered_at = 0', [
      Date.now(),
    ]);
  },
  // 5 → 6：task 增加 repeatSourceId（recurring-tasks-v2 issue 01，派生来源）。
  (storage) => addColumnIfMissing(storage, 'task', 'repeatSourceId', 'TEXT'),
  // 6 → 7：project 增加 feedPosition（feed-project-ordering spec，Feed Position）。
  (storage) => addColumnIfMissing(storage, 'project', 'feedPosition', 'TEXT'),
  // 7 → 8：Area / ProjectHeading / TagGroup / Subtask 增加 position（retire-sort-order）。
  addPositionToSortOrderEntities,
  // 8 → 9：删除 sortOrder 列（retire-sort-order）。
  dropSortOrder,
  // 9 → 10：project 增加 repeatRule / repeatSourceId（recurring-projects spec）。
  async (storage) => {
    await addColumnIfMissing(storage, 'project', 'repeatRule', 'TEXT');
    await addColumnIfMissing(storage, 'project', 'repeatSourceId', 'TEXT');
  },
  // 10 → 11：Tag Group 转为父 Tag（嵌套 Tag，ADR-0016）。
  nestTagGroups,
  // 11 → 12：增加 attachment 表（Task 附件，ADR-0019）。
  addAttachments,
];

/** 当前代码的副本 schema 版本。 */
export const REPLICA_SCHEMA_VERSION = REPLICA_MIGRATIONS.length;

/** 副本由更新版本的 Taskora 写入（降级安装）：拒绝打开。 */
export class ReplicaSchemaTooNewError extends Error {
  readonly name = 'ReplicaSchemaTooNewError';

  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(`本地副本 schema 版本 ${found} 高于当前应用支持的 ${supported}，请升级 Taskora`);
  }
}

export async function readSchemaVersion(storage: SqlStorage): Promise<number> {
  const rows = await storage.all<{ user_version: number }>('PRAGMA user_version');
  return Number(rows[0]?.user_version ?? 0);
}

async function writeSchemaVersion(storage: SqlStorage, version: number): Promise<void> {
  // PRAGMA 不接受绑定参数；version 是本模块算出的整数。
  await storage.exec(`PRAGMA user_version = ${Math.trunc(version)}`);
}

async function hasEngineTables(storage: SqlStorage): Promise<boolean> {
  const rows = await storage.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_engine_meta'",
  );
  return rows.length > 0;
}

/**
 * 把副本升到 REPLICA_SCHEMA_VERSION。返回迁移前的版本（新库为 null）。
 * migrations 参数只供测试注入。
 */
export async function migrateReplica(
  storage: SqlStorage,
  migrations: readonly ReplicaMigration[] = REPLICA_MIGRATIONS,
): Promise<number | null> {
  const target = migrations.length;
  const current = await readSchemaVersion(storage);
  if (current > target) throw new ReplicaSchemaTooNewError(current, target);
  if (current === 0 && !(await hasEngineTables(storage))) {
    await inTransaction(storage, async () => {
      await createMissingTables(storage);
      await writeSchemaVersion(storage, target);
    });
    return null;
  }
  for (let version = current; version < target; version += 1) {
    await inTransaction(storage, async () => {
      await migrations[version](storage);
      await writeSchemaVersion(storage, version + 1);
    });
  }
  return current;
}
