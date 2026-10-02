import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Client } from 'pg';

const exec = promisify(execFile);
const CONTRACT = '20261002180000_drop_sort_order';
const ORIGINAL_CHECKSUM = '88b8e90e25caed20e687f04e20645e4cb1758fdc67d568fcc1415becc9a0a134';
const TABLES = ['Task', 'Subtask', 'Project', 'ProjectHeading', 'Area', 'Tag', 'TagGroup'];
// Separate from Prisma's own migration lock: its CLI runs in another session.
const LOCK_NAME = 'taskora:migration-bootstrap';
const DEFAULT_ROOT = resolve(__dirname, '../..');
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

interface FailedMigration {
  migration_name: string;
  checksum: string;
  logs: string | null;
  applied_steps_count: number;
}

export const MIGRATION_FAILURE_HELP = `Database migration failed; the API was not started.
Stop other backend instances and back up PostgreSQL before manual repair.
Inspect: docker compose run --rm --no-deps backend node node_modules/prisma/build/index.js migrate status
Details: SELECT migration_name, logs FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;
Do not delete migration history or blindly resolve unknown failures.
See docs/versioning-and-deployment.md (migration recovery).`;

/** Run Prisma against the same URL used by the lock/inspection connection. */
export async function runPrismaMigrate(
  args: string[],
  options: { backendRoot?: string; databaseUrl: string; signal?: AbortSignal },
): Promise<void> {
  const root = options.backendRoot ?? DEFAULT_ROOT;
  try {
    await exec(
      process.execPath,
      [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', ...args],
      {
        cwd: root,
        env: { ...process.env, DATABASE_URL: options.databaseUrl },
        timeout: 10 * 60_000,
        maxBuffer: 16 * 1024 * 1024,
        signal: options.signal,
      },
    );
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `Prisma migrate ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}\n${result.message ?? ''}`,
      { cause: error },
    );
  }
}

async function recoverKnownGuardFailure(
  client: Client,
  schema: string,
  deploy: (args: string[]) => Promise<void>,
  log: (message: string) => void,
) {
  const history = `${quote(schema)}."_prisma_migrations"`;
  const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [history]);
  if (!exists.rows[0].present) return; // Fresh installation.
  const { rows } = await client.query<FailedMigration>(
    `SELECT migration_name, checksum, logs, applied_steps_count FROM ${history}
     WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
  );
  if (rows.length === 0) return;
  const failed = rows[0];
  const knownGuard =
    rows.length === 1 &&
    failed.migration_name === CONTRACT &&
    failed.checksum === ORIGINAL_CHECKSUM &&
    failed.applied_steps_count === 0 &&
    /(?:Task|Subtask|Project|ProjectHeading|Area|Tag|TagGroup) 有 [1-9]\d* 行 position 为空：先部署协议 4 的 hub 完成启动物化，再删 sortOrder/.test(
      failed.logs ?? '',
    );
  if (!knownGuard) {
    throw new Error(
      `Refusing automatic recovery of failed migrations: ${rows.map((row) => row.migration_name).join(', ')}`,
    );
  }

  // resolve only changes bookkeeping; verify that no contract DDL was applied.
  // Scope to the configured schema (not a similarly named table elsewhere).
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = ANY($2::text[])
       AND column_name IN ('sortOrder', 'position', 'createdAt')`,
    [schema, TABLES],
  );
  const valid = TABLES.every((table) => {
    const fields = columns.rows.filter((column) => column.table_name === table);
    return (
      fields.some((c) => c.column_name === 'position' && c.data_type === 'text') &&
      fields.some(
        (c) => c.column_name === 'sortOrder' && c.data_type === 'integer' && c.is_nullable === 'NO',
      ) &&
      fields.some(
        (c) =>
          c.column_name === 'createdAt' &&
          c.data_type === 'timestamp without time zone' &&
          c.is_nullable === 'NO',
      )
    );
  });
  if (!valid)
    throw new Error(
      `Refusing automatic recovery of ${CONTRACT}: unexpected or partially contracted schema`,
    );

  log(`Recovering the known legacy Position guard failure: ${CONTRACT}`);
  await deploy(['resolve', '--rolled-back', CONTRACT]);
}

/**
 * Bootstrap's single migration entry point. The dedicated session owns the lock
 * across inspection, resolve and deploy; never borrow a Prisma pool connection.
 * Only the original, side-effect-free guard failure is recoverable. A failed
 * corrected migration (including interruption) requires operator inspection.
 */
export async function deployDatabase(
  options: {
    databaseUrl?: string;
    backendRoot?: string;
    lockTimeoutMs?: number;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const root = options.backendRoot ?? DEFAULT_ROOT;
  if (!options.databaseUrl && existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for database migrations');
  const schema = new URL(databaseUrl).searchParams.get('schema') ?? 'public';
  const log = options.log ?? (() => {});
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  const abort = new AbortController();
  const connectionLost = (error: Error) => abort.abort(error);
  client.on('error', connectionLost);
  client.on('end', () => abort.abort(new Error('Migration lock connection closed')));
  const deploy = (args: string[]) =>
    runPrismaMigrate(args, { databaseUrl, backendRoot: root, signal: abort.signal });
  try {
    await client.connect();
    const deadline = Date.now() + (options.lockTimeoutMs ?? 120_000);
    for (;;) {
      const lock = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS acquired',
        [LOCK_NAME],
      );
      if (lock.rows[0].acquired) break;
      if (Date.now() >= deadline)
        throw new Error('Timed out waiting for another backend to finish migrations');
      await delay(200, undefined, { signal: abort.signal });
    }
    log('Checking for pending database migrations...');
    await recoverKnownGuardFailure(client, schema, deploy, log);
    await deploy(['deploy']);
    abort.signal.throwIfAborted();
    log('Database migrations are up to date.');
  } finally {
    // Closing this exact session releases its advisory lock even on errors.
    await client.end();
  }
}
