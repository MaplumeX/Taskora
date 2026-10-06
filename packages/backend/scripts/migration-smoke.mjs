/* global fetch, AbortSignal */
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
// Linux CI: validate the actual runtime image against historical release DDL +
// synthetic data. Never use a production URL. Each case gets its own schema.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { synthPosition } from '@taskora/engine';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const image = process.argv[2];
assert(
  image && process.env.TEST_DATABASE_URL,
  'Usage: TEST_DATABASE_URL=... node scripts/migration-smoke.mjs <image>',
);
const tables = ['Task', 'Subtask', 'Project', 'ProjectHeading', 'Area', 'Tag', 'TagGroup'];
const contract = '20261002180000_drop_sort_order';
const quote = (s) => `"${s.replaceAll('"', '""')}"`;

async function availablePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

for (const scenario of ['v0.7.1', 'v0.7.2', 'P3009', 'empty']) {
  const schema = `smoke_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('schema', schema);
  const databaseUrl = url.toString();
  const client = new Client({ connectionString: databaseUrl });
  const work = await mkdtemp(resolve(tmpdir(), 'taskora-image-upgrade-'));
  const name = `taskora-${schema}`;
  let started = false;
  try {
    await client.connect();
    await client.query(`CREATE SCHEMA ${quote(schema)}`);
    await client.query(`SET search_path TO ${quote(schema)}`);
    const migrate = (args) =>
      exec(
        process.execPath,
        [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', ...args],
        {
          cwd: work,
          env: { ...process.env, DATABASE_URL: databaseUrl },
          timeout: 120_000,
        },
      );
    const before = {};
    if (scenario !== 'empty') {
      const version = scenario === 'P3009' ? 'v0.7.2' : scenario;
      const path = 'packages/backend/prisma';
      const { stdout } = await exec('git', ['ls-tree', '-r', '--name-only', version, '--', path], {
        cwd: repo,
      });
      for (const file of stdout.trim().split('\n')) {
        if (
          !file.endsWith('.sql') &&
          !file.endsWith('schema.prisma') &&
          !file.endsWith('migration_lock.toml')
        )
          continue;
        const target = resolve(work, file.replace('packages/backend/', ''));
        await mkdir(dirname(target), { recursive: true });
        const content = await exec('git', ['show', `${version}:${file}`], { cwd: repo });
        await writeFile(target, content.stdout);
      }
      await symlink(resolve(root, 'node_modules'), resolve(work, 'node_modules'), 'dir');
      await migrate(['deploy']);
      await client.query(
        await readFile(resolve(root, 'test/fixtures/legacy-positions.sql'), 'utf8'),
      );
      if (scenario === 'P3009') {
        const expand = '20261002120000_sort_order_entity_positions';
        await cp(
          resolve(root, 'prisma/migrations', expand),
          resolve(work, 'prisma/migrations', expand),
          { recursive: true },
        );
        await mkdir(resolve(work, 'prisma/migrations', contract));
        await cp(
          resolve(root, 'test/fixtures/drop-sort-order.original.sql'),
          resolve(work, 'prisma/migrations', contract, 'migration.sql'),
        );
        await assert.rejects(migrate(['deploy']), /P3018/);
        await assert.rejects(migrate(['deploy']), /P3009/);
      }
      for (const table of tables) {
        before[table] = (
          await client.query(`SELECT to_jsonb(t) AS row FROM ${quote(table)} t`)
        ).rows.map((r) => r.row);
      }
    }
    const port = await availablePort();
    await exec('docker', [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'host',
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      '-e',
      `PORT=${port}`,
      '-e',
      'JWT_SECRET=migration-smoke-only',
      '-e',
      `AGENT_ENCRYPTION_KEY=${'ab'.repeat(32)}`,
      image,
    ]);
    started = true;
    let healthy = false;
    for (let i = 0; i < 90; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) {
          healthy = true;
          break;
        }
      } catch {
        /* Startup is not ready yet. */
      }
      const state = await exec('docker', ['inspect', '-f', '{{.State.Running}}', name]);
      assert.equal(state.stdout.trim(), 'true', 'backend exited before becoming healthy');
      await delay(1000);
    }
    assert(healthy, 'backend health check timed out');
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'sortOrder'`,
      [schema],
    );
    assert.equal(columns.rowCount, 0);
    for (const table of tables) {
      // 嵌套 Tag（ADR-0016）：Tag Group 已转为同 id 的 Tag
      const current = table === 'TagGroup' ? 'Tag' : table;
      const rows = (
        await client.query(`SELECT to_jsonb(t) AS row FROM ${quote(current)} t`)
      ).rows.map((r) => r.row);
      for (const row of rows) assert.notEqual(row.position, null);
      for (const old of before[table] ?? []) {
        const row = rows.find((r) => r.id === old.id);
        assert.equal(
          row.position,
          old.position ?? synthPosition(old.sortOrder, new Date(`${old.createdAt}Z`)),
        );
        assert.equal(row.updatedAt, old.updatedAt);
        assert.deepEqual(row.fieldClocks, old.fieldClocks);
      }
    }
    const failed = await client.query(
      'SELECT id FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL',
    );
    assert.equal(failed.rowCount, 0);
    console.log(`PASS image upgrade: ${scenario}`);
  } catch (error) {
    if (started) {
      const logs = await exec('docker', ['logs', name]);
      console.error(logs.stdout, logs.stderr);
    }
    throw error;
  } finally {
    if (started) await exec('docker', ['rm', '-f', name]);
    await client.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`);
    await client.end();
    await rm(work, { recursive: true, force: true });
  }
}
