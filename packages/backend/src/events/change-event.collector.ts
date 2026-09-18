import type { PrismaClient } from '@prisma/client';

import type { ChangeAction, ChangeEntity } from '@taskora/shared';

import { ChangeEventHub } from './change-event-hub.service';

/**
 * Collects write descriptors from the Prisma extension and publishes Change
 * Events after every transaction settles.
 *
 * Why deferred flushing: payload refetches run on the base (unextended)
 * client, which reads committed data. Operations inside a transaction are
 * invisible until commit, so descriptors are queued and flushed only when
 * the transaction depth reaches zero (both $transaction forms increment it
 * synchronously, before any macrotask flush can run).
 *
 * Rollback safety: after a rejected transaction the queued descriptors are
 * flushed anyway, but every descriptor is re-verified at flush time —
 * created/updated rows are refetched (a rolled-back create reads null and
 * is dropped) and deleted rows are checked for existence — so a rolled-back
 * write cannot emit a harmful event.
 */

/** Prisma write operations that produce Change Events. */
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type PrismaModel = keyof PrismaClient;

interface Descriptor {
  entity: ChangeEntity;
  action: ChangeAction;
  id: string;
  /** Routing key; captured at record time for deletes (payload is absent). */
  userId?: string;
  /** Subtasks have no userId — routing goes through the parent task. */
  ownerTaskId?: string;
}

/** Relation tables and the parent entity their writes map to. */
const RELATION_PARENT: Partial<Record<PrismaModel, { parent: ChangeEntity; fk: string }>> = {
  taskTag: { parent: 'task', fk: 'taskId' },
  projectTag: { parent: 'project', fk: 'projectId' },
  areaTag: { parent: 'area', fk: 'areaId' },
};

const ENTITY_MODEL: Record<ChangeEntity, PrismaModel> = {
  task: 'task',
  subtask: 'subtask',
  project: 'project',
  'project-heading': 'projectHeading',
  area: 'area',
  tag: 'tag',
  'tag-group': 'tagGroup',
};

/** Models whose direct writes emit events for the entity itself. */
const ENTITY_MODELS = new Set<PrismaModel>(Object.values(ENTITY_MODEL));

export class ChangeEventCollector {
  private readonly pending: Descriptor[] = [];
  private txDepth = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private base!: PrismaClient;

  constructor(private readonly hub: ChangeEventHub) {}

  /**
   * Bind the raw (unextended) PrismaClient and build the query extension
   * that records write descriptors. Called by PrismaService, which owns
   * the raw client.
   */
  attach(base: PrismaClient) {
    this.base = base;
    return this.buildExtension();
  }

  /**
   * Wrap a $transaction (both array and interactive forms): descriptors
   * recorded inside are held until the outermost transaction settles.
   */
  async transaction<T>(run: () => Promise<T>): Promise<T> {
    this.txDepth++;
    try {
      return await run();
    } finally {
      this.txDepth--;
      if (this.txDepth === 0) {
        this.scheduleFlush();
      }
    }
  }

  /** Build the Prisma query extension that feeds `record*` below. */
  private buildExtension() {
    const query: Record<string, { $allOperations: (params: OpParams) => Promise<unknown> }> = {};
    const covered = [...ENTITY_MODELS, ...(Object.keys(RELATION_PARENT) as PrismaModel[])];
    for (const model of covered) {
      query[model as string] = {
        $allOperations: (params) => this.handleOperation(model, params),
      };
    }
    return { name: 'changeEvents', query };
  }

  private async handleOperation(
    model: PrismaModel,
    { operation, args, query }: OpParams,
  ): Promise<unknown> {
    if (!WRITE_OPS.has(operation)) {
      return query(args);
    }

    const pre = await this.preCollect(model, operation, args);
    const result = await query(args);
    this.postCollect(model, operation, args, result, pre);
    return result;
  }

  /**
   * Capture ids/ownership that are only knowable BEFORE the operation runs
   * (deleteMany/updateMany return just a count).
   */
  private async preCollect(
    model: PrismaModel,
    operation: string,
    args: WriteArgs,
  ): Promise<PreInfo> {
    const relation = RELATION_PARENT[model];

    if (operation === 'deleteMany' || operation === 'updateMany') {
      if (relation) {
        // Relation tables have no userId column — the fk is all we need.
        const rows = await this.findRows(model, args.where, [relation.fk]);
        return { parentIds: unique(rows.map((row) => row[relation.fk])) };
      }
      // deleteMany loses the rows entirely — always capture them up front
      // (even when `where.id` is a plain string: project-headings deletes
      // via deleteMany({ where: { id, userId, projectId } })).
      if (operation === 'deleteMany' || !isString(args.where?.id)) {
        const fields = model === 'subtask' ? ['id', 'taskId'] : ['id', 'userId'];
        const rows = await this.findRows(model, args.where, fields);
        if (operation === 'deleteMany') {
          return { deleted: rows.map((row) => this.deleteInfo(model, row)) };
        }
        return { updatedIds: rows.map((row) => row.id as string) };
      }
      return {};
    }

    if (relation && operation === 'createMany') {
      // Relation createMany: parent ids come straight from the data rows.
      const data = (args.data ?? []) as Record<string, unknown>[];
      return { parentIds: unique(data.map((row) => row[relation.fk]).filter(isString)) };
    }

    return {};
  }

  /** Turn the operation result into descriptors (flushed post-commit). */
  private postCollect(
    model: PrismaModel,
    operation: string,
    args: WriteArgs,
    result: unknown,
    pre: PreInfo,
  ): void {
    const relation = RELATION_PARENT[model];

    if (relation) {
      const parent = relation.parent;
      if (pre.parentIds) {
        for (const id of pre.parentIds) {
          this.record({ entity: parent, action: 'updated', id });
        }
        return;
      }
      // create / update / upsert / delete return the row itself.
      const row = result as Record<string, unknown> | null;
      const parentId = row?.[relation.fk];
      if (isString(parentId)) {
        this.record({ entity: parent, action: 'updated', id: parentId });
      }
      return;
    }

    const entity = entityForModel(model);
    const row = result as Record<string, unknown> | null | undefined;

    switch (operation) {
      case 'create':
      case 'update':
      case 'upsert': {
        const id = row?.id;
        if (isString(id)) {
          this.record({
            entity,
            action: operation === 'create' ? 'created' : 'updated',
            id,
          });
        }
        return;
      }
      case 'createMany': {
        // Entity-level createMany returns no ids; the only call site
        // (convert-to-project) was rewritten to per-row creates. If a new
        // one appears, rewrite it too — otherwise these writes are silent.
        return;
      }
      case 'updateMany': {
        const ids = pre.updatedIds ?? whereIds(args.where);
        for (const id of ids) {
          this.record({ entity, action: 'updated', id });
        }
        return;
      }
      case 'delete': {
        if (row && isString(row.id)) {
          this.record({ entity, action: 'deleted', ...this.deleteInfo(model, row) });
        }
        return;
      }
      case 'deleteMany': {
        for (const item of pre.deleted ?? []) {
          this.record({ entity, action: 'deleted', ...item });
        }
        return;
      }
    }
  }

  /** Ownership info for a row about to disappear (subtask routes via task). */
  private deleteInfo(
    model: PrismaModel,
    row: Record<string, unknown>,
  ): { id: string; userId?: string; ownerTaskId?: string } {
    const id = row.id as string;
    if (model === 'subtask') {
      return { id, ownerTaskId: isString(row.taskId) ? row.taskId : undefined };
    }
    return { id, userId: isString(row.userId) ? row.userId : undefined };
  }

  /** Record a descriptor and kick a flush when no transaction holds it. */
  private record(descriptor: Descriptor): void {
    this.pending.push(descriptor);
    if (this.txDepth === 0) {
      this.scheduleFlush();
    }
  }

  private async findRows(
    model: PrismaModel,
    where: unknown,
    fields: string[],
  ): Promise<Record<string, unknown>[]> {
    const delegate = this.base[model] as unknown as {
      findMany(args: unknown): Promise<Record<string, unknown>[]>;
    };
    return delegate.findMany({
      where,
      select: Object.fromEntries(fields.map((f) => [f, true])),
    });
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.enqueueRun();
    }, 0);
  }

  /** Run one flush pass; further arrivals chain onto it. */
  private enqueueRun(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this.runFlush()).catch(() => undefined);
    return this.flushChain;
  }

  /**
   * Merge + verify + publish everything pending. Public for deterministic
   * tests; production flushing rides the macrotask scheduled by
   * scheduleFlush. Awaits any in-flight run and drains descriptors that
   * arrive while waiting.
   */
  async flush(): Promise<void> {
    for (let guard = 0; guard < 10; guard += 1) {
      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
        this.enqueueRun();
      }
      await this.flushChain;
      if (this.pending.length === 0 && this.flushTimer === null) return;
    }
  }

  private async runFlush(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending.splice(0, this.pending.length);
      const merged = mergeDescriptors(batch);
      for (const descriptor of merged) {
        try {
          await this.publishDescriptor(descriptor);
        } catch (error) {
          // Best effort: log and keep going. A dropped event drifts the
          // client cache until the next reconnect/resync backstop.
          console.error('[change-events] failed to publish event', descriptor, error);
        }
      }
    }
  }

  private async publishDescriptor(descriptor: Descriptor): Promise<void> {
    if (descriptor.action === 'deleted') {
      // Existence re-check: a rolled-back delete leaves the row alive.
      const stillThere = await this.rowExists(descriptor.entity, descriptor.id);
      if (stillThere) return;
      const userId =
        descriptor.userId ??
        (descriptor.ownerTaskId ? await this.taskOwnerUserId(descriptor.ownerTaskId) : undefined);
      if (!userId) return; // cannot route; drop defensively
      this.hub.publish(userId, {
        entity: descriptor.entity,
        action: 'deleted',
        id: descriptor.id,
      });
      return;
    }

    const payload = await this.buildPayload(descriptor.entity, descriptor.id);
    if (!payload) return; // rolled back or hard-deleted after the write
    this.hub.publish(payload.userId, {
      entity: descriptor.entity,
      action: descriptor.action,
      id: descriptor.id,
      // Dates → ISO strings, exactly what clients receive over HTTP.
      data: serialize(payload.data) as never,
    });
  }

  private async rowExists(entity: ChangeEntity, id: string): Promise<boolean> {
    const model = this.base[ENTITY_MODEL[entity]] as unknown as {
      findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    };
    return (await model.findUnique({ where: { id }, select: { id: true } })) !== null;
  }

  /** Subtasks have no userId — ownership resolves through the parent task. */
  private async taskOwnerUserId(taskId: string): Promise<string | undefined> {
    const task = (await this.base.task.findUnique({
      where: { id: taskId },
      select: { userId: true },
    })) as Record<string, unknown> | null;
    const userId = task?.userId;
    return isString(userId) ? userId : undefined;
  }

  /** Resolve the routing userId for an entity row (subtask → parent task). */
  private async resolveUserId(
    entity: ChangeEntity,
    row: Record<string, unknown>,
  ): Promise<string | null> {
    if (isString(row.userId)) return row.userId;
    if (entity === 'subtask' && isString(row.taskId)) {
      return (await this.taskOwnerUserId(row.taskId)) ?? null;
    }
    return null;
  }

  /** Fetch the entity in its list-DTO shape (task/project/area embed tags). */
  private async buildPayload(
    entity: ChangeEntity,
    id: string,
  ): Promise<{ userId: string; data: unknown } | null> {
    const model = this.base[ENTITY_MODEL[entity]] as unknown as {
      findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    };

    // task / project / area embed their tags in the list DTO.
    const withTags = entity === 'task' || entity === 'project' || entity === 'area';
    const row = await model.findUnique({
      where: { id },
      ...(withTags ? { include: { tags: { include: { tag: true } } } } : {}),
    });
    if (!row) return null;

    const userId = await this.resolveUserId(entity, row);
    if (!userId) return null;

    if (!withTags) {
      return { userId, data: row };
    }
    const tags = Array.isArray(row.tags)
      ? row.tags.map((tt) => (tt as Record<string, unknown>).tag)
      : [];
    return { userId, data: { ...row, tags } };
  }
}

// ---------- helpers ----------

interface OpParams {
  operation: string;
  args: WriteArgs;
  query: (args: WriteArgs) => Promise<unknown>;
}

interface WriteArgs {
  where?: Record<string, unknown>;
  data?: unknown;
  [key: string]: unknown;
}

interface PreInfo {
  /** Parent entity ids (relation-table writes). */
  parentIds?: string[];
  /** id + ownership of rows about to be deleted. */
  deleted?: { id: string; userId?: string; ownerTaskId?: string }[];
  /** ids of rows about to be updated (broad where, no pre-known id). */
  updatedIds?: string[];
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function unique(values: unknown[]): string[] {
  return [...new Set(values.filter(isString))];
}

/** Extract ids from `where` when it pins a single id. */
function whereIds(where: WriteArgs['where']): string[] {
  const id = where?.id;
  if (isString(id)) return [id];
  return [];
}

function entityForModel(model: PrismaModel): ChangeEntity {
  const entry = Object.entries(ENTITY_MODEL).find(([, m]) => m === model);
  if (!entry) throw new Error(`No ChangeEntity for model ${String(model)}`);
  return entry[0] as ChangeEntity;
}

/**
 * Merge same-entity descriptors into the final action:
 * created+updated → created; anything+deleted → deleted; created+deleted
 * (same flush window) → dropped (no observer ever saw the create).
 */
function mergeDescriptors(batch: Descriptor[]): Descriptor[] {
  const merged = new Map<string, Descriptor>();
  for (const descriptor of batch) {
    const key = `${descriptor.entity}:${descriptor.id}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...descriptor });
      continue;
    }
    previous.userId = previous.userId ?? descriptor.userId;
    previous.ownerTaskId = previous.ownerTaskId ?? descriptor.ownerTaskId;
    if (descriptor.action === 'deleted') {
      if (previous.action === 'created') {
        merged.delete(key); // created then deleted: nothing to announce
      } else {
        previous.action = 'deleted';
      }
    } else if (descriptor.action === 'created' || previous.action === 'created') {
      previous.action = 'created';
    }
    // plain updated → updated (keep previous action)
  }
  return [...merged.values()];
}

/** Deep-serialize Dates to ISO strings, mirroring HTTP JSON responses. */
function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
