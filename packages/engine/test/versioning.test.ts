/**
 * 副本 schema 版本与同步协议版本（local-first-v3 issue 03）。
 *
 * 副本：新建、旧库升级、降级安装三条路径，以及迁移中途失败后重开。
 * 协议：旧 hub 逐条拒绝不认识的实体（留在 Outbox、hub 升级后送达），
 * 本端跳过不认识的远端实体，hub 要求更高协议版本时停止同步。
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAG_COLOR,
  REPLICA_SCHEMA_VERSION,
  ReplicaSchemaTooNewError,
  SyncUpgradeRequiredError,
  migrateReplica,
  openEngine,
  readSchemaVersion,
  schemaDdl,
  synthPosition,
  type ReplicaMigration,
  type SyncEntity,
  type SyncTransport,
} from '../src/index';
import { HybridClock } from '../src/hlc';
import { InMemorySyncHub } from '../src/hub';
import { createNodeSqliteStorage } from '../src/node';
import type { SqlStorage } from '../src/storage';

const USER = 'user-1';

async function columnsOf(storage: SqlStorage, table: string): Promise<string[]> {
  const rows = await storage.all<{ name: string }>(
    `SELECT name FROM pragma_table_info('${table}')`,
  );
  return rows.map((row) => row.name);
}

/**
 * 版本号出现之前的安装：user_version 为 0，缺后来加的列与表
 * （_outbox.kind / revision、task.reminderTime / repeatRule / repeatSourceId、project_heading）。
 */
async function legacyReplica(): Promise<SqlStorage> {
  const storage = await createNodeSqliteStorage(':memory:');
  for (const statement of schemaDdl()) await storage.exec(statement);
  await storage.exec('DROP TABLE project_heading');
  await storage.exec('ALTER TABLE task DROP COLUMN reminderTime');
  await storage.exec('ALTER TABLE task DROP COLUMN repeatRule');
  await storage.exec('ALTER TABLE task DROP COLUMN repeatSourceId');
  await storage.exec('ALTER TABLE _outbox DROP COLUMN kind');
  await storage.exec('ALTER TABLE _outbox DROP COLUMN revision');
  await storage.run("INSERT INTO task (id, title, clocks) VALUES ('t1', 'Legacy', '{}')");
  await storage.run("INSERT INTO _outbox (entity, entity_id, fields) VALUES ('task', 't1', '{}')");
  return storage;
}

/** 嵌套 Tag 之前（版本 10 及更早）的 Tag Group 表与 tag.tagGroupId 列。 */
async function legacyTagGroups(storage: SqlStorage): Promise<void> {
  await storage.exec(
    "CREATE TABLE tag_group (id TEXT PRIMARY KEY, title TEXT, position TEXT, createdAt TEXT, updatedAt TEXT, clocks TEXT NOT NULL DEFAULT '{}')",
  );
  await storage.exec('DROP INDEX tag_parent');
  await storage.exec('ALTER TABLE tag DROP COLUMN parentId');
  await storage.exec('ALTER TABLE tag ADD COLUMN tagGroupId TEXT');
  await storage.exec('CREATE INDEX tag_group_member ON tag (tagGroupId)');
}

function open(storage: SqlStorage, transport?: SyncTransport) {
  return openEngine({
    storage,
    deviceId: 'device-a',
    clock: new HybridClock('device-a', () => 1_000_000),
    transport,
  });
}

describe('副本 schema 版本', () => {
  it('新建副本：直接建到最新版本', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    const engine = await open(storage);
    expect(await readSchemaVersion(storage)).toBe(REPLICA_SCHEMA_VERSION);
    expect(await columnsOf(storage, 'task')).toEqual(
      expect.arrayContaining(['reminderTime', 'repeatRule', 'repeatSourceId']),
    );
    await engine.close();
  });

  it('旧副本升级：补齐列与表，保留数据与 Outbox', async () => {
    const storage = await legacyReplica();
    expect(await readSchemaVersion(storage)).toBe(0);

    const engine = await open(storage);

    expect(await readSchemaVersion(storage)).toBe(REPLICA_SCHEMA_VERSION);
    expect(await columnsOf(storage, '_outbox')).toEqual(
      expect.arrayContaining(['kind', 'revision']),
    );
    expect(await columnsOf(storage, 'project_heading')).toContain('projectId');
    expect(await columnsOf(storage, 'task')).toContain('repeatSourceId');
    expect((await engine.get('task', 't1'))?.fields.title).toBe('Legacy');
    expect(await engine.pendingCount()).toBe(1);
    await engine.update('task', 't1', { reminderTime: '09:00' });
    expect((await engine.get('task', 't1'))?.fields.reminderTime).toBe('09:00');
    await engine.close();
  });

  it('4 → 5：旧的 Compact 登记按迁移时刻计入保留期', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    for (const statement of schemaDdl()) await storage.exec(statement);
    await storage.exec('ALTER TABLE _compacted DROP COLUMN registered_at');
    await storage.run("INSERT INTO _compacted (entity, entity_id) VALUES ('task', 'gone')");
    await storage.exec('PRAGMA user_version = 4');
    const before = Date.now();

    const engine = await open(storage);
    const [row] = await storage.all<{ registered_at: number }>(
      'SELECT registered_at FROM _compacted',
    );
    expect(row.registered_at).toBeGreaterThanOrEqual(before);
    expect(await engine.isCompacted('task', 'gone')).toBe(true);
    await engine.close();
  });

  it('7 → 9：四个实体增加 position，空 position 按 hub 的 legacy 口径填充（不入 Outbox），再删 sortOrder', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    for (const statement of schemaDdl()) await storage.exec(statement);
    await legacyTagGroups(storage);
    // 版本 7 的副本：七张表都有 sortOrder，四张表还没有 position
    for (const table of [
      'task',
      'project',
      'tag',
      'subtask',
      'project_heading',
      'area',
      'tag_group',
    ]) {
      await storage.exec(`ALTER TABLE ${table} ADD COLUMN sortOrder INTEGER`);
    }
    for (const table of ['subtask', 'project_heading', 'area', 'tag_group']) {
      await storage.exec(`ALTER TABLE ${table} DROP COLUMN position`);
    }
    const createdAt = '2026-09-01T00:00:00.000Z';
    await storage.run(
      "INSERT INTO area (id, title, sortOrder, createdAt, clocks) VALUES ('a2', 'Second', 2, ?, '{}')",
      [createdAt],
    );
    await storage.run(
      "INSERT INTO area (id, title, sortOrder, createdAt, clocks) VALUES ('a1', 'First', 1, ?, '{}')",
      [createdAt],
    );
    await storage.run(
      "INSERT INTO subtask (id, title, sortOrder, createdAt, clocks) VALUES ('s1', 'Sub', 0, ?, '{}')",
      [createdAt],
    );
    await storage.run(
      "INSERT INTO task (id, title, sortOrder, createdAt, clocks) VALUES ('t1', 'Legacy', 4, ?, '{}')",
      [createdAt],
    );
    await storage.exec('PRAGMA user_version = 7');

    const engine = await open(storage);

    for (const table of ['subtask', 'project_heading', 'area']) {
      expect(await columnsOf(storage, table)).toContain('position');
    }
    expect((await engine.get('area', 'a1'))?.fields.position).toBe(
      synthPosition(1, new Date(createdAt)),
    );
    expect((await engine.get('subtask', 's1'))?.fields.position).toBe(
      synthPosition(0, new Date(createdAt)),
    );
    expect((await engine.list('area')).map((row) => row.id)).toEqual(['a1', 'a2']);
    // Task 早有 position 列：仍为空的同样补齐
    expect((await engine.get('task', 't1'))?.fields.position).toBe(
      synthPosition(4, new Date(createdAt)),
    );
    // 8 → 9：sortOrder 列删除（tag_group 随后在 10 → 11 退役）
    for (const table of ['task', 'project', 'tag', 'subtask', 'project_heading', 'area']) {
      expect(await columnsOf(storage, table)).not.toContain('sortOrder');
    }
    expect(await engine.pendingCount()).toBe(0);
    await engine.close();
  });

  it('10 → 11：Tag Group 转为同 id 的父 Tag，成员改挂 parentId，Outbox 与 Compact 登记一并改写', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    for (const statement of schemaDdl()) await storage.exec(statement);
    await legacyTagGroups(storage);
    const clock = (field: string) => `0000000001000:0000:${field}`;
    await storage.run(
      'INSERT INTO tag_group (id, title, position, createdAt, updatedAt, clocks) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'g1',
        '场景',
        'a1',
        '2026-09-01T00:00:00.000Z',
        '2026-09-02T00:00:00.000Z',
        JSON.stringify({ title: clock('title'), position: clock('position') }),
      ],
    );
    await storage.run(
      'INSERT INTO tag (id, title, color, position, tagGroupId, clocks) VALUES (?, ?, ?, ?, ?, ?)',
      ['t1', '办公室', '#FF0000', 'a0', 'g1', JSON.stringify({ tagGroupId: clock('group') })],
    );
    await storage.run(
      "INSERT INTO tag (id, title, color, position, tagGroupId, clocks) VALUES ('t2', '紧急', '#00FF00', 'a2', NULL, '{}')",
    );
    await storage.run(
      "INSERT INTO _outbox (entity, entity_id, fields) VALUES ('tag-group', 'g2', ?)",
      [JSON.stringify({ title: { value: '新组', hlc: clock('g2') } })],
    );
    await storage.run("INSERT INTO _outbox (entity, entity_id, fields) VALUES ('tag', 't2', ?)", [
      JSON.stringify({ tagGroupId: { value: 'g1', hlc: clock('t2') } }),
    ]);
    await storage.run(
      "INSERT INTO _compacted (entity, entity_id, registered_at) VALUES ('tag-group', 'gone', 5)",
    );
    await storage.exec('PRAGMA user_version = 10');

    const engine = await open(storage);

    expect(await readSchemaVersion(storage)).toBe(REPLICA_SCHEMA_VERSION);
    expect(await columnsOf(storage, 'tag_group')).toEqual([]);
    expect(await columnsOf(storage, 'tag')).not.toContain('tagGroupId');
    expect(await engine.get('tag', 'g1')).toEqual({
      id: 'g1',
      fields: expect.objectContaining({
        title: '场景',
        color: DEFAULT_TAG_COLOR,
        position: 'a1',
        parentId: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    });
    expect((await engine.get('tag', 't1'))?.fields.parentId).toBe('g1');
    expect((await engine.get('tag', 't2'))?.fields.parentId).toBeNull();
    const clocks = await storage.all<{ id: string; clocks: string }>(
      "SELECT id, clocks FROM tag WHERE id IN ('g1', 't1') ORDER BY id",
    );
    expect(clocks.map((row) => JSON.parse(row.clocks))).toEqual([
      { title: clock('title'), position: clock('position') },
      { parentId: clock('group') },
    ]);
    const outbox = await storage.all<{ entity: string; entity_id: string; fields: string }>(
      'SELECT entity, entity_id, fields FROM _outbox ORDER BY id',
    );
    expect(
      outbox.map((row) => [row.entity, row.entity_id, Object.keys(JSON.parse(row.fields))]),
    ).toEqual([
      ['tag', 'g2', ['title']],
      ['tag', 't2', ['parentId']],
    ]);
    expect(await engine.isCompacted('tag', 'gone')).toBe(true);
    await engine.close();
  });

  it('10 → 11 之后：连上协议 5 的 hub 才做一次 bootstrap', async () => {
    let protocol = 4;
    const hub = new InMemorySyncHub({ protocolVersion: () => protocol });
    const storage = await createNodeSqliteStorage(':memory:');
    for (const statement of schemaDdl()) await storage.exec(statement);
    await legacyTagGroups(storage);
    await storage.exec(
      'CREATE TABLE IF NOT EXISTS _engine_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    await storage.run("INSERT INTO _engine_meta (key, value) VALUES ('syncCursor', '7')");
    await storage.exec('PRAGMA user_version = 10');
    const bootstraps: number[] = [];
    const transport = hub.transportFor(USER);
    const engine = await open(storage, {
      ...transport,
      bootstrap: async (request) => {
        bootstraps.push(protocol);
        return transport.bootstrap(request);
      },
    });
    const flag = () => storage.all("SELECT value FROM _engine_meta WHERE key = 'tagTreeResync'");

    await engine.sync();
    expect(await flag()).toHaveLength(1); // 旧 hub：标记留着
    protocol = 5; // hub 升级
    await engine.sync();
    expect(await flag()).toHaveLength(0);
    await engine.sync();
    // 协议 4 那次是旧游标引起的常规 resync；协议 5 上恰好一次
    expect(bootstraps).toEqual([4, 5]);
    await engine.close();
  });

  it('11 → 12 之后：连上协议 6 的 hub 才做一次 bootstrap，取回旧版跳过的附件', async () => {
    let protocol = 5;
    const hub = new InMemorySyncHub({ protocolVersion: () => protocol });
    // 新版设备已经建了任务与附件
    const writer = await open(await createNodeSqliteStorage(':memory:'), hub.transportFor(USER));
    const taskId = await writer.create('task', { title: '带附件', status: 'ACTIVE' });
    const attachmentId = await writer.create('attachment', {
      taskId,
      name: 'a.pdf',
      mimeType: 'application/pdf',
      size: 3,
      blobHash: 'a'.repeat(64),
    });
    await writer.sync();

    // 旧版设备：没有 attachment 表，游标已越过这些变更（attachment 被跳过）
    const storage = await createNodeSqliteStorage(':memory:');
    for (const statement of schemaDdl()) await storage.exec(statement);
    await storage.exec('DROP TABLE attachment');
    await storage.run("INSERT INTO _engine_meta (key, value) VALUES ('syncCursor', ?)", [
      String(hub.currentSeq(USER)),
    ]);
    await storage.exec('PRAGMA user_version = 11');
    const engine = await open(storage, hub.transportFor(USER));
    expect(await readSchemaVersion(storage)).toBe(REPLICA_SCHEMA_VERSION);
    const flag = () => storage.all("SELECT value FROM _engine_meta WHERE key = 'attachmentResync'");

    await engine.sync();
    expect(await flag()).toHaveLength(1); // 旧 hub：标记留着
    expect(await engine.get('attachment', attachmentId)).toBeNull();
    protocol = 6; // hub 升级
    await engine.sync();
    expect(await flag()).toHaveLength(0);
    expect((await engine.get('attachment', attachmentId))?.fields).toMatchObject({
      taskId,
      name: 'a.pdf',
      size: 3,
    });
    await writer.close();
    await engine.close();
  });

  it('已是最新版本：重开不再迁移', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    await migrateReplica(storage);
    expect(await migrateReplica(storage)).toBe(REPLICA_SCHEMA_VERSION);
    expect(await readSchemaVersion(storage)).toBe(REPLICA_SCHEMA_VERSION);
  });

  it('降级安装：拒绝打开更新版本写入的副本', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    await migrateReplica(storage);
    await storage.exec(`PRAGMA user_version = ${REPLICA_SCHEMA_VERSION + 1}`);

    const error = await open(storage).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ReplicaSchemaTooNewError);
    expect(error).toMatchObject({
      found: REPLICA_SCHEMA_VERSION + 1,
      supported: REPLICA_SCHEMA_VERSION,
    });
  });

  it('迁移中途失败：已完成的步骤保留，重开从失败的那一步继续', async () => {
    const storage = await createNodeSqliteStorage(':memory:');
    await storage.exec('CREATE TABLE _engine_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    let failing = true;
    const migrations: ReplicaMigration[] = [
      (s) => s.exec('CREATE TABLE step_one (id TEXT)'),
      async (s) => {
        await s.exec('CREATE TABLE step_two (id TEXT)');
        if (failing) throw new Error('boom');
      },
    ];

    await expect(migrateReplica(storage, migrations)).rejects.toThrow('boom');
    expect(await readSchemaVersion(storage)).toBe(1);
    expect(await columnsOf(storage, 'step_two')).toEqual([]); // 该步整体回滚

    failing = false;
    await migrateReplica(storage, migrations);
    expect(await readSchemaVersion(storage)).toBe(2);
    expect(await columnsOf(storage, 'step_two')).toEqual(['id']);
  });
});

describe('同步协议版本', () => {
  it('旧 hub 不认识的实体逐条拒绝：其余照常送达，被拒的留在 Outbox，hub 升级后送达', async () => {
    const known: SyncEntity[] = ['task', 'subtask', 'project', 'area', 'tag'];
    const hub = new InMemorySyncHub({ knownEntities: known });
    const engine = await open(await createNodeSqliteStorage(':memory:'), hub.transportFor(USER));

    const groupId = await engine.create('project-heading', { title: 'Contexts' });
    const taskId = await engine.create('task', { title: 'Ship it' });
    await engine.sync();

    const snapshot = hub.bootstrap(USER).snapshot;
    expect(snapshot.some((entry) => entry.id === taskId)).toBe(true);
    expect(snapshot.some((entry) => entry.id === groupId)).toBe(false);
    expect(await engine.pendingCount()).toBe(1);

    known.push('project-heading'); // hub 升级
    await engine.sync();

    expect(hub.bootstrap(USER).snapshot.some((entry) => entry.id === groupId)).toBe(true);
    expect(await engine.pendingCount()).toBe(0);
    await engine.close();
  });

  it('跳过本端不认识的远端实体（pull 与 bootstrap），其余照常应用', async () => {
    const task = {
      entity: 'task',
      id: 't1',
      fields: { title: 'From hub' },
      clocks: { title: '0000000001000:0000:hub' },
    };
    const widget = { entity: 'widget', id: 'w1', fields: { name: 'x' }, clocks: {} };
    const transport: SyncTransport = {
      push: async () => ({ acked: 0 }),
      pull: async () =>
        ({
          changes: [
            { kind: 'entity', seq: 1, ...widget },
            { kind: 'compact', seq: 2, entity: 'widget', ids: ['w2'] },
            { kind: 'entity', seq: 3, ...task },
          ],
          cursor: 3,
          resync: false,
        }) as never,
      bootstrap: async () =>
        ({
          snapshot: [widget, task],
          cursor: 3,
          compacted: [{ entity: 'widget', ids: ['w3'] }],
        }) as never,
    };
    const engine = await open(await createNodeSqliteStorage(':memory:'), transport);

    await engine.pull();
    expect((await engine.get('task', 't1'))?.fields.title).toBe('From hub');
    expect(await engine.cursor()).toBe(3);

    await engine.bootstrap();
    expect((await engine.get('task', 't1'))?.fields.title).toBe('From hub');
    await engine.close();
  });

  it('hub 要求更高的协议版本：停止同步，Outbox 保留', async () => {
    const transport: SyncTransport = {
      push: async () => ({ acked: 1, minProtocolVersion: 99 }),
      pull: async () => ({ changes: [], cursor: 0, resync: false, minProtocolVersion: 99 }),
      bootstrap: async () => ({ snapshot: [], cursor: 0, minProtocolVersion: 99 }),
    };
    const engine = await open(await createNodeSqliteStorage(':memory:'), transport);
    await engine.create('task', { title: 'Offline edit' });

    await expect(engine.sync()).rejects.toBeInstanceOf(SyncUpgradeRequiredError);
    expect(await engine.pendingCount()).toBe(1);
    await engine.close();
  });
});
