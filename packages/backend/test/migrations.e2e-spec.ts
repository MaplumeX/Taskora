import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import {
  synthPosition,
  validatePosition,
  positionsBetween,
  migrateReplica,
  REPLICA_MIGRATIONS,
  schemaDdl,
} from '@taskora/engine';
import { createNodeSqliteStorage } from '@taskora/engine/node';
import { deployDatabase, runPrismaMigrate } from '../src/migrations/deploy';

const ROOT = resolve(__dirname, '..');
const CONTRACT = '20261002180000_drop_sort_order';
const EXPAND = '20261002120000_sort_order_entity_positions';
const TABLES = ['Task', 'Subtask', 'Project', 'ProjectHeading', 'Area', 'Tag', 'TagGroup'];
const TEST_URL = process.env.TEST_DATABASE_URL;
const dbDescribe = TEST_URL ? describe : describe.skip;
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const resources: Array<{ client: Client; schema: string; root: string }> = [];

async function sandbox() {
  const schema = `migration_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(TEST_URL!);
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const root = await mkdtemp(resolve(tmpdir(), 'taskora-migration-test-'));
  resources.push({ client, schema, root });
  await client.query(`CREATE SCHEMA ${quote(schema)}`);
  await client.query(`SET search_path TO ${quote(schema)}`);
  await mkdir(resolve(root, 'prisma/migrations'), { recursive: true });
  await cp(resolve(ROOT, 'prisma/schema.prisma'), resolve(root, 'prisma/schema.prisma'));
  await cp(
    resolve(ROOT, 'prisma/migrations/migration_lock.toml'),
    resolve(root, 'prisma/migrations/migration_lock.toml'),
  );
  await symlink(resolve(ROOT, 'node_modules'), resolve(root, 'node_modules'), 'dir');
  const options = { databaseUrl, backendRoot: root };
  async function copyThrough(last: string) {
    for (const name of await readdir(resolve(ROOT, 'prisma/migrations'))) {
      if (name <= last)
        await cp(
          resolve(ROOT, 'prisma/migrations', name),
          resolve(root, 'prisma/migrations', name),
          { recursive: true },
        );
    }
  }
  async function installLegacy(last = EXPAND) {
    await copyThrough(last);
    await runPrismaMigrate(['deploy'], options);
    await client.query(await readFile(resolve(__dirname, 'fixtures/legacy-positions.sql'), 'utf8'));
  }
  async function failOriginal() {
    await installLegacy();
    await copyThrough(CONTRACT);
    await cp(
      resolve(__dirname, 'fixtures/drop-sort-order.original.sql'),
      resolve(root, 'prisma/migrations', CONTRACT, 'migration.sql'),
    );
    await expect(runPrismaMigrate(['deploy'], options)).rejects.toThrow('P3018');
    await expect(runPrismaMigrate(['deploy'], options)).rejects.toThrow('P3009');
    await copyThrough(CONTRACT);
  }
  return { client, schema, root, options, copyThrough, installLegacy, failOriginal };
}

interface SnapshotRow {
  id: string;
  sortOrder: number;
  position?: string | null;
  createdAt: string;
  [field: string]: unknown;
}

async function snapshot(client: Client) {
  const result: Record<string, SnapshotRow[]> = {};
  for (const table of [...TABLES, 'SyncChange', 'SyncCounter']) {
    // JSON preserves timestamp-without-zone spelling regardless of the Node TZ.
    result[table] = (
      await client.query(
        `SELECT to_jsonb(t) AS row FROM ${quote(table)} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
      )
    ).rows.map((r) => r.row);
  }
  return result;
}

function assertMaterialized(
  before: Awaited<ReturnType<typeof snapshot>>,
  after: Awaited<ReturnType<typeof snapshot>>,
) {
  for (const table of TABLES) {
    expect(after[table]).toHaveLength(before[table].length);
    for (const row of before[table]) {
      const { sortOrder, position, ...unchanged } = row;
      const expected = position ?? synthPosition(sortOrder, new Date(`${row.createdAt}Z`));
      const actual = after[table].find((r) => r.id === row.id);
      const addedFields =
        table === 'Project' && !('feedPosition' in row) ? { feedPosition: null } : {};
      expect(actual).toEqual({ ...unchanged, ...addedFields, position: expected });
      validatePosition(actual!.position!);
    }
  }
  expect(after.SyncChange).toEqual(before.SyncChange);
  expect(after.SyncCounter).toEqual(before.SyncCounter);
}

async function assertContracted(client: Client, schema: string) {
  const columns = await client.query(
    `SELECT table_name FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'sortOrder'`,
    [schema],
  );
  expect(columns.rows).toHaveLength(0);
  for (const table of TABLES) {
    expect(
      (await client.query(`SELECT id FROM ${quote(table)} WHERE position IS NULL`)).rows,
    ).toHaveLength(0);
  }
}

afterEach(async () => {
  for (const { client, schema, root } of resources.splice(0)) {
    await client.query('ROLLBACK');
    await client.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
    await client.end();
    await rm(root, { recursive: true, force: true });
  }
});

dbDescribe('historical Position migration (real PostgreSQL + Prisma CLI)', () => {
  it('SQL matches Engine byte-for-byte across radix/date boundaries and session time zones', async () => {
    const { client } = await sandbox();
    const sql = await readFile(
      resolve(ROOT, 'prisma/migrations', CONTRACT, 'migration.sql'),
      'utf8',
    );
    // Extract the actual function definition, not a second implementation in tests.
    await client.query(sql.slice(sql.indexOf('CREATE FUNCTION'), sql.indexOf('DO $$')));
    const orders = [-1, 0, 1, 61, 62, 3839, 3840, 3905, 3906, 242233, 242234, 1_000_000];
    const dates = [
      '0001-01-01T00:00:00.000Z',
      '1960-01-01T00:00:00.001Z',
      '1970-01-01T00:00:00.000Z',
      '2026-10-02T03:12:34.567Z',
      '2099-12-31T23:59:59.999Z',
      '2100-01-01T00:00:00.000Z',
      '2100-01-01T00:00:00.001Z',
    ];
    for (const timezone of ['UTC', 'Asia/Shanghai', 'America/New_York']) {
      await client.query(`SELECT set_config('TimeZone', $1, false)`, [timezone]);
      for (const order of orders) {
        for (const date of dates) {
          const { rows } = await client.query(
            'SELECT pg_temp.taskora_legacy_position($1, $2::timestamp) AS position',
            [order, date.slice(0, -1)],
          );
          expect(rows[0].position, `${timezone}/${order}/${date}`).toBe(
            synthPosition(order, new Date(date)),
          );
          validatePosition(rows[0].position);
        }
      }
    }
    // Integer maximum cannot be tested by allocating Engine's n+1 key array.
    const max = await client.query(
      `SELECT pg_temp.taskora_legacy_position(2147483647, TIMESTAMP '2100-01-01') AS position`,
    );
    validatePosition(max.rows[0].position);
    expect(positionsBetween(null, null, 63)[62]).toBe('b00');
  }, 30_000);

  it.each([
    ['v0.7.1 (N-2)', '20260930180000_task_repeat_source'],
    ['v0.7.2 (N-1)', '20261001120000_project_feed_position'],
    ['expanded database', EXPAND],
  ])(
    '%s upgrades with plain migrate deploy; repeats without modifying data',
    async (_version, cutoff) => {
      const s = await sandbox();
      await s.installLegacy(cutoff);
      const before = await snapshot(s.client);
      await s.copyThrough(CONTRACT);
      await runPrismaMigrate(['deploy'], s.options);
      await assertContracted(s.client, s.schema);
      const after = await snapshot(s.client);
      assertMaterialized(before, after);
      await runPrismaMigrate(['deploy'], s.options);
      await deployDatabase(s.options);
      expect(await snapshot(s.client)).toEqual(after);
      // Only legacy rows: existing device positions intentionally supersede sortOrder.
      const expected = before.Task.filter((r) => r.position == null)
        .sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt))
        .map((r) => r.id);
      const ordered = await s.client.query(
        'SELECT id FROM "Task" WHERE id = ANY($1::text[]) ORDER BY position COLLATE "C"',
        [expected],
      );
      expect(ordered.rows.map((r) => r.id)).toEqual(expected);
    },
    60_000,
  );

  it('protocol-4 Local Replica migration produces the same positions for all seven entities', async () => {
    const s = await sandbox();
    await s.installLegacy();
    const before = await snapshot(s.client);
    const storage = await createNodeSqliteStorage(':memory:');
    const replicaTables = [
      'task',
      'subtask',
      'project',
      'project_heading',
      'area',
      'tag',
      'tag_group',
    ];
    try {
      for (const statement of schemaDdl()) await storage.exec(statement);
      // 当时的副本还有 tag_group 表（10 → 11 才退役）
      await storage.exec(
        "CREATE TABLE tag_group (id TEXT PRIMARY KEY, title TEXT, position TEXT, createdAt TEXT, updatedAt TEXT, clocks TEXT NOT NULL DEFAULT '{}')",
      );
      for (let i = 0; i < TABLES.length; i++) {
        const table = replicaTables[i];
        await storage.exec(`ALTER TABLE ${table} ADD COLUMN sortOrder INTEGER`);
        for (const row of before[TABLES[i]]) {
          await storage.run(
            `INSERT INTO ${table} (id, sortOrder, position, createdAt, clocks) VALUES (?, ?, ?, ?, '{}')`,
            [row.id, row.sortOrder, row.position ?? null, `${row.createdAt}Z`],
          );
        }
      }
      await storage.exec('PRAGMA user_version = 7');
      // 只升到 9（sortOrder 退役），之后的步骤与本用例无关
      await migrateReplica(storage, REPLICA_MIGRATIONS.slice(0, 9));
      await s.copyThrough(CONTRACT);
      await deployDatabase(s.options);
      const after = await snapshot(s.client);
      for (let i = 0; i < TABLES.length; i++) {
        const rows = await storage.all<{ id: string; position: string }>(
          `SELECT id, position FROM ${replicaTables[i]}`,
        );
        for (const row of rows)
          expect(row.position).toBe(after[TABLES[i]].find((r) => r.id === row.id)!.position);
      }
      expect(await storage.all('SELECT * FROM _outbox')).toHaveLength(0);
    } finally {
      await storage.close();
    }
  }, 60_000);

  it('nested tags: hub migration and Local Replica 10 -> 11 convert Tag Groups identically', async () => {
    const s = await sandbox();
    await s.copyThrough('20261005120000_project_repeat');
    await runPrismaMigrate(['deploy'], s.options);
    const clock = (field: string) => `1800000000000:0:${field}`;
    await s.client.query(
      `INSERT INTO "User" (id, email, "passwordHash", "updatedAt")
       VALUES ('tag-user', 'tags@example.test', 'x', TIMESTAMP '2026-10-01 00:00:00')`,
    );
    const groups = [
      {
        id: 'g1',
        title: '场景',
        position: 'a1',
        clocks: { title: clock('g1t'), position: clock('g1p') },
      },
      { id: 'g2', title: '精力', position: 'a2', clocks: null },
    ];
    const tags = [
      {
        id: 't1',
        title: '办公室',
        color: '#FF0000',
        position: 'a0',
        group: 'g1',
        clocks: { tagGroupId: clock('t1g'), title: clock('t1t') },
      },
      { id: 't2', title: '在家', color: '#00FF00', position: 'a3', group: 'g1', clocks: null },
      {
        id: 't3',
        title: '紧急',
        color: '#0000FF',
        position: 'a4',
        group: null,
        clocks: { color: clock('t3c') },
      },
    ];
    for (const group of groups) {
      await s.client.query(
        `INSERT INTO "TagGroup" (id, title, position, "userId", "createdAt", "updatedAt", "fieldClocks")
         VALUES ($1, $2, $3, 'tag-user', TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-02 00:00:00', $4)`,
        [group.id, group.title, group.position, group.clocks && JSON.stringify(group.clocks)],
      );
    }
    for (const tag of tags) {
      await s.client.query(
        `INSERT INTO "Tag" (id, title, color, position, "tagGroupId", "userId", "createdAt", "updatedAt", "fieldClocks")
         VALUES ($1, $2, $3, $4, $5, 'tag-user', TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-10-02 00:00:00', $6)`,
        [
          tag.id,
          tag.title,
          tag.color,
          tag.position,
          tag.group,
          tag.clocks && JSON.stringify(tag.clocks),
        ],
      );
    }
    await s.client.query(
      `INSERT INTO "CompactedEntity" (id, "userId", entity, "entityId") VALUES ('c1', 'tag-user', 'tag-group', 'gone')`,
    );

    // 同一份数据在版本 10 的副本里（hub 下发的 wire 视图：时间为 ISO、时钟为空对象而非 null）
    const storage = await createNodeSqliteStorage(':memory:');
    try {
      for (const statement of schemaDdl()) await storage.exec(statement);
      await storage.exec(
        "CREATE TABLE tag_group (id TEXT PRIMARY KEY, title TEXT, position TEXT, createdAt TEXT, updatedAt TEXT, clocks TEXT NOT NULL DEFAULT '{}')",
      );
      await storage.exec('DROP INDEX tag_parent');
      await storage.exec('ALTER TABLE tag DROP COLUMN parentId');
      await storage.exec('ALTER TABLE tag ADD COLUMN tagGroupId TEXT');
      for (const group of groups) {
        await storage.run(
          'INSERT INTO tag_group (id, title, position, createdAt, updatedAt, clocks) VALUES (?, ?, ?, ?, ?, ?)',
          [
            group.id,
            group.title,
            group.position,
            '2026-10-01T00:00:00.000Z',
            '2026-10-02T00:00:00.000Z',
            JSON.stringify(group.clocks ?? {}),
          ],
        );
      }
      for (const tag of tags) {
        await storage.run(
          'INSERT INTO tag (id, title, color, position, tagGroupId, createdAt, updatedAt, clocks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            tag.id,
            tag.title,
            tag.color,
            tag.position,
            tag.group,
            '2026-10-01T00:00:00.000Z',
            '2026-10-02T00:00:00.000Z',
            JSON.stringify(tag.clocks ?? {}),
          ],
        );
      }
      await storage.exec('PRAGMA user_version = 10');
      await migrateReplica(storage);

      await s.copyThrough('99999999999999');
      await deployDatabase(s.options);

      const hubRows = (
        await s.client.query<{
          id: string;
          title: string;
          color: string;
          position: string;
          parentId: string | null;
          fieldClocks: Record<string, string> | null;
        }>('SELECT id, title, color, position, "parentId", "fieldClocks" FROM "Tag" ORDER BY id')
      ).rows;
      const replicaRows = await storage.all<{
        id: string;
        title: string;
        color: string;
        position: string;
        parentId: string | null;
        clocks: string;
      }>('SELECT id, title, color, position, parentId, clocks FROM tag ORDER BY id');
      expect(replicaRows.map((row) => ({ ...row, clocks: JSON.parse(row.clocks) }))).toEqual(
        hubRows.map(({ fieldClocks, ...row }) => ({ ...row, clocks: fieldClocks ?? {} })),
      );
      expect(hubRows.map((row) => [row.id, row.parentId])).toEqual([
        ['g1', null],
        ['g2', null],
        ['t1', 'g1'],
        ['t2', 'g1'],
        ['t3', null],
      ]);
      expect(hubRows.find((row) => row.id === 't1')!.fieldClocks).toEqual({
        parentId: clock('t1g'),
        title: clock('t1t'),
      });
      expect(
        (await s.client.query('SELECT entity, "entityId" FROM "CompactedEntity"')).rows,
      ).toEqual([{ entity: 'tag', entityId: 'gone' }]);
      expect(
        (await s.client.query(`SELECT to_regclass('"TagGroup"') AS present`)).rows[0].present,
      ).toBeNull();
    } finally {
      await storage.close();
    }
  }, 60_000);

  it('fresh installation and two simultaneous bootstraps both succeed', async () => {
    const s = await sandbox();
    await s.copyThrough(CONTRACT);
    await Promise.all([deployDatabase(s.options), deployDatabase(s.options)]);
    await assertContracted(s.client, s.schema);
    expect(
      (
        await s.client.query(
          'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL',
        )
      ).rows[0].count,
    ).toBe('0');
  }, 60_000);

  it('recovers a real P3009 guard failure once, including concurrent starts', async () => {
    const s = await sandbox();
    await s.failOriginal();
    const before = await snapshot(s.client);
    const log: string[] = [];
    await Promise.all([
      deployDatabase({ ...s.options, log: (m) => log.push(m) }),
      deployDatabase(s.options),
    ]);
    await assertContracted(s.client, s.schema);
    assertMaterialized(before, await snapshot(s.client));
    const history = (
      await s.client.query(
        'SELECT * FROM "_prisma_migrations" WHERE migration_name = $1 ORDER BY started_at',
        [CONTRACT],
      )
    ).rows;
    expect(history).toHaveLength(2);
    expect(history[0].rolled_back_at).not.toBeNull();
    expect(history[1].finished_at).not.toBeNull();
    await deployDatabase(s.options);
  }, 60_000);

  it.each(['checksum', 'logs', 'name', 'second failure', 'partial DDL'])(
    'does not resolve an unknown or unsafe failure (%s)',
    async (change) => {
      const s = await sandbox();
      await s.failOriginal();
      if (change === 'checksum')
        await s.client.query(
          `UPDATE "_prisma_migrations" SET checksum = 'unknown' WHERE migration_name = $1`,
          [CONTRACT],
        );
      if (change === 'logs')
        await s.client.query(
          `UPDATE "_prisma_migrations" SET logs = 'permission denied' WHERE migration_name = $1`,
          [CONTRACT],
        );
      if (change === 'name')
        await s.client.query(
          `UPDATE "_prisma_migrations" SET migration_name = 'unknown' WHERE migration_name = $1`,
          [CONTRACT],
        );
      if (change === 'second failure')
        await s.client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, logs) VALUES ('other', 'unknown', 'other', 'error')`,
        );
      if (change === 'partial DDL')
        await s.client.query(`ALTER TABLE "Tag" DROP COLUMN "sortOrder"`);
      const before = (await s.client.query('SELECT * FROM "_prisma_migrations" ORDER BY id')).rows;
      await expect(deployDatabase(s.options)).rejects.toThrow('Refusing automatic recovery');
      expect((await s.client.query('SELECT * FROM "_prisma_migrations" ORDER BY id')).rows).toEqual(
        before,
      );
    },
    60_000,
  );

  it('preserves a database that successfully applied the original checksum', async () => {
    const s = await sandbox();
    await s.copyThrough(CONTRACT);
    await cp(
      resolve(__dirname, 'fixtures/drop-sort-order.original.sql'),
      resolve(s.root, 'prisma/migrations', CONTRACT, 'migration.sql'),
    );
    await runPrismaMigrate(['deploy'], s.options); // Empty original installation succeeds.
    const before = (await s.client.query('SELECT * FROM "_prisma_migrations" ORDER BY id')).rows;
    await s.copyThrough(CONTRACT);
    await deployDatabase(s.options);
    expect((await s.client.query('SELECT * FROM "_prisma_migrations" ORDER BY id')).rows).toEqual(
      before,
    );
  }, 60_000);

  it('rolls back all backfills and drops on a late SQL failure; direct retry is safe', async () => {
    const s = await sandbox();
    await s.installLegacy();
    const before = await snapshot(s.client);
    // Force the LAST table's DROP to fail, after all seven backfills and six drops.
    await s.client.query('CREATE VIEW block_drop AS SELECT "sortOrder" FROM "TagGroup"');
    const sql = await readFile(
      resolve(ROOT, 'prisma/migrations', CONTRACT, 'migration.sql'),
      'utf8',
    );
    await expect(s.client.query(sql)).rejects.toThrow('depend on it');
    await s.client.query('ROLLBACK');
    expect(await snapshot(s.client)).toEqual(before);
    await s.client.query('DROP VIEW block_drop');
    await s.client.query(sql);
    assertMaterialized(before, await snapshot(s.client));
    await assertContracted(s.client, s.schema);
  }, 60_000);

  it('an interrupted corrected migration is atomic and refuses automatic resolve until inspected', async () => {
    const s = await sandbox();
    await s.installLegacy();
    const before = await snapshot(s.client);
    await s.copyThrough(CONTRACT);
    const file = resolve(s.root, 'prisma/migrations', CONTRACT, 'migration.sql');
    const sql = await readFile(file, 'utf8');
    const application = `fault_${s.schema}`;
    await writeFile(
      file,
      sql
        .replace('BEGIN;', `BEGIN;\nSET LOCAL application_name = '${application}';`)
        .replace(
          'ALTER TABLE "TagGroup" DROP',
          'SELECT pg_sleep(30);\nALTER TABLE "TagGroup" DROP',
        ),
    );
    // Attach the rejection handler immediately while polling the other session.
    const running = runPrismaMigrate(['deploy'], s.options).then(
      () => null,
      (error) => error,
    );
    let pid: number | undefined;
    for (let i = 0; i < 100; i++) {
      const active = await s.client.query(
        `SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'PgSleep'`,
        [application],
      );
      pid = active.rows[0]?.pid;
      if (pid) break;
      await delay(100);
    }
    expect(pid).toBeDefined();
    await s.client.query('SELECT pg_terminate_backend($1)', [pid]);
    expect(await running).toBeInstanceOf(Error);
    expect(await snapshot(s.client)).toEqual(before);
    await s.copyThrough(CONTRACT);
    await expect(deployDatabase(s.options)).rejects.toThrow('Refusing automatic recovery');
    // After operator inspection, the ordinary documented resolve/retry works.
    await runPrismaMigrate(['resolve', '--rolled-back', CONTRACT], s.options);
    await deployDatabase(s.options);
    assertMaterialized(before, await snapshot(s.client));
  }, 60_000);

  it('a restart after resolve but before deploy resumes without another resolve', async () => {
    const s = await sandbox();
    await s.failOriginal();
    await runPrismaMigrate(['resolve', '--rolled-back', CONTRACT], s.options);
    await deployDatabase(s.options);
    await assertContracted(s.client, s.schema);
    expect(
      (
        await s.client.query('SELECT id FROM "_prisma_migrations" WHERE migration_name = $1', [
          CONTRACT,
        ])
      ).rowCount,
    ).toBe(2);
  }, 60_000);

  it('waits with a bound when another session owns the bootstrap lock', async () => {
    const s = await sandbox();
    await s.client.query(
      `SELECT pg_advisory_lock(hashtext('taskora:migration-bootstrap')::bigint)`,
    );
    await expect(deployDatabase({ ...s.options, lockTimeoutMs: 1 })).rejects.toThrow(
      'Timed out waiting',
    );
    await s.client.query(
      `SELECT pg_advisory_unlock(hashtext('taskora:migration-bootstrap')::bigint)`,
    );
  });
});

describe('original migration recovery fingerprint', () => {
  it('keeps the exact released file as a failure fixture', async () => {
    const original = await readFile(resolve(__dirname, 'fixtures/drop-sort-order.original.sql'));
    expect(createHash('sha256').update(original).digest('hex')).toBe(
      '88b8e90e25caed20e687f04e20645e4cb1758fdc67d568fcc1415becc9a0a134',
    );
  });
});
