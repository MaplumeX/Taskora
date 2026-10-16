import { randomUUID } from 'node:crypto';

import {
  ENTITIES,
  REFERENCE_FIELDS,
  feedSortKey,
  isSyncEntity,
  positionsBetween,
  sortByEffectivePosition,
  type SyncEntity,
} from '@taskora/engine';
import type {
  DataImportSkipReason,
  DataImportStats,
  DataPackageCalendarSubscription,
  DataPackageData,
  DataPackageEntity,
} from '@taskora/shared';

/**
 * 导入计划（`.scratch/data-import/spec.md`「导入流水线」）：把数据包内容
 * 变成「导入为副本」要写的行。纯函数，不碰数据库。
 *
 * - 每条记录换新 id，引用字段一并改写；指向包内不存在记录的引用按 compact
 *   语义处理（标量置 null、数组剔除、Task 子实体与 heading 整条丢弃）。
 * - Tag 按「从顶层到自身的标题路径」合并到目标账号现有 Tag。
 * - Task / Project / Area / Tag 的 Position 是每用户一个键空间（新建追加
 *   到全局末尾），导入的行按原相对顺序追加在现有行之后；feed 混排键
 *   （任务 Position、项目 Feed Position）同理。heading / subtask / attachment
 *   在全新的父级里，保留原 Position。
 */

/** REFERENCE_FIELDS 之外的引用：重复来源、heading 所属项目。 */
const EXTRA_REFERENCES: Partial<Record<SyncEntity, Record<string, SyncEntity>>> = {
  task: { repeatSourceId: 'task' },
  project: { repeatSourceId: 'project' },
  'project-heading': { projectId: 'project' },
};

/** 父级失效时整条丢弃（而不是置 null）的引用：Task 子实体与 heading。 */
const REQUIRED_REFERENCES: Partial<Record<SyncEntity, string>> = {
  subtask: 'taskId',
  attachment: 'taskId',
  'project-heading': 'projectId',
};

/** 写入顺序：被引用的实体在前（同事务内外键须先存在）。 */
const WRITE_ORDER: SyncEntity[] = [
  'tag',
  'area',
  'project',
  'project-heading',
  'task',
  'subtask',
  'attachment',
];

/**
 * Position 每用户一个键空间、导入时追加到末尾的实体。Task 的 Position 同时
 * 是 feed 混排键，与项目的 Feed Position 一起排（见 appendedPositions）。
 */
const APPENDED_ENTITIES = ['project', 'area', 'tag'] as const;

export interface ImportTarget {
  /** 目标账号现有 Tag（含父级），用于按路径合并。 */
  tags: ReadonlyArray<{ id: string; title: string; parentId: string | null }>;
  /** 各键空间现有的最大 Position；feed 为任务 Position 与项目 feed 键的最大值。 */
  lastPositions: Partial<
    Record<(typeof APPENDED_ENTITIES)[number] | 'task' | 'feed', string | null>
  >;
  /** 目标账号已有的 Blob；包内没带文件的附件，内容已在账号里时照常导入。 */
  blobHashes: ReadonlySet<string>;
  calendarUrls: ReadonlySet<string>;
}

export interface ImportPackage {
  data: DataPackageData;
  /** 包内带的 Blob。 */
  blobHashes: ReadonlySet<string>;
}

export interface ImportWrite {
  entity: SyncEntity;
  id: string;
  fields: Record<string, unknown>;
}

export interface ImportPlan {
  writes: ImportWrite[];
  calendarSubscriptions: DataPackageCalendarSubscription[];
  stats: DataImportStats;
}

export function buildImportPlan(
  pkg: ImportPackage,
  target: ImportTarget,
  newId: () => string = randomUUID,
): ImportPlan {
  const stats: DataImportStats = { created: {}, mergedTags: 0, skipped: {} };
  const skip = (reason: DataImportSkipReason, count = 1) => {
    stats.skipped[reason] = (stats.skipped[reason] ?? 0) + count;
  };

  // 只认当前 hub 的实体与字段；字段缺省交给列默认值。
  const rows = new Map<SyncEntity, DataPackageEntity[]>();
  for (const [entity, list] of Object.entries(pkg.data.entities)) {
    if (!isSyncEntity(entity)) {
      skip('unknown-entity', list.length);
      continue;
    }
    const known = new Set(ENTITIES[entity].fields.map((field) => field.name));
    rows.set(
      entity,
      list.map((row) => ({
        id: row.id,
        fields: Object.fromEntries(Object.entries(row.fields).filter(([key]) => known.has(key))),
      })),
    );
  }
  const rowsOf = (entity: SyncEntity) => rows.get(entity) ?? [];

  // 包内 id → 目标账号 id。合并的 Tag 映射到现有 id，其余换新 id。
  const ids = new Map<SyncEntity, Map<string, string>>();
  const idsOf = (entity: SyncEntity) => {
    let map = ids.get(entity);
    if (!map) ids.set(entity, (map = new Map()));
    return map;
  };
  const mergedTagIds = mapTags(rowsOf('tag'), target.tags, idsOf('tag'), newId);
  stats.mergedTags = mergedTagIds.size;

  // 父级缺失的 heading / 子实体丢弃；附件内容既不在包内也不在账号里时丢弃。
  const kept = new Map<SyncEntity, DataPackageEntity[]>();
  const keptIds = new Map<SyncEntity, Set<string>>();
  for (const entity of WRITE_ORDER) {
    if (entity === 'tag') continue;
    const required = REQUIRED_REFERENCES[entity];
    const parent = required ? referencedEntity(entity, required) : null;
    const list = rowsOf(entity).filter((row) => {
      if (required && parent) {
        const value = row.fields[required];
        if (typeof value !== 'string' || !keptIds.get(parent)?.has(value)) {
          skip('missing-parent');
          return false;
        }
      }
      if (entity === 'attachment') {
        const hash = row.fields.blobHash;
        if (
          typeof hash !== 'string' ||
          (!pkg.blobHashes.has(hash) && !target.blobHashes.has(hash))
        ) {
          skip('missing-blob');
          return false;
        }
      }
      return true;
    });
    kept.set(entity, list);
    keptIds.set(entity, new Set(list.map((row) => row.id)));
    for (const row of list) idsOf(entity).set(row.id, newId());
  }
  kept.set(
    'tag',
    rowsOf('tag').filter((row) => !mergedTagIds.has(row.id)),
  );

  const positions = appendedPositions(kept, target.lastPositions);

  const writes: ImportWrite[] = [];
  for (const entity of WRITE_ORDER) {
    const list =
      entity === 'tag' ? topologicalTags(kept.get('tag') ?? []) : (kept.get(entity) ?? []);
    for (const row of list) {
      const fields = remapReferences(entity, row.fields, (refEntity, value) =>
        idsOf(refEntity).get(value),
      );
      const override = positions.get(`${entity}:${row.id}`);
      if (override) Object.assign(fields, override);
      writes.push({ entity, id: idsOf(entity).get(row.id)!, fields });
    }
    if (list.length > 0) stats.created[entity] = list.length;
  }

  const calendarSubscriptions: DataPackageCalendarSubscription[] = [];
  const seenUrls = new Set(target.calendarUrls);
  for (const subscription of pkg.data.calendarSubscriptions) {
    if (seenUrls.has(subscription.url)) {
      skip('duplicate-calendar');
      continue;
    }
    seenUrls.add(subscription.url);
    calendarSubscriptions.push(subscription);
  }
  if (calendarSubscriptions.length > 0) {
    stats.created.calendarSubscriptions = calendarSubscriptions.length;
  }

  return { writes, calendarSubscriptions, stats };
}

function referencedEntity(entity: SyncEntity, field: string): SyncEntity | null {
  return REFERENCE_FIELDS[entity]?.[field]?.entity ?? EXTRA_REFERENCES[entity]?.[field] ?? null;
}

/**
 * 改写引用字段：命中映射的换成新 id；未命中的标量置 null、数组剔除。
 */
function remapReferences(
  entity: SyncEntity,
  fields: Record<string, unknown>,
  lookup: (entity: SyncEntity, id: string) => string | undefined,
): Record<string, unknown> {
  const result = { ...fields };
  const refs: Record<string, { entity: SyncEntity; array?: boolean }> = {
    ...REFERENCE_FIELDS[entity],
    ...Object.fromEntries(
      Object.entries(EXTRA_REFERENCES[entity] ?? {}).map(([field, ref]) => [
        field,
        { entity: ref },
      ]),
    ),
  };
  for (const [field, ref] of Object.entries(refs)) {
    if (!(field in result)) continue;
    const value = result[field];
    if (ref.array) {
      result[field] = Array.isArray(value)
        ? value.flatMap((id) => {
            const mapped = typeof id === 'string' ? lookup(ref.entity, id) : undefined;
            return mapped ? [mapped] : [];
          })
        : [];
    } else {
      result[field] = typeof value === 'string' ? (lookup(ref.entity, value) ?? null) : null;
    }
  }
  return result;
}

/** Tag 的标题路径键：从顶层到自身，去首尾空白；环与悬挂父级在此截断。 */
function tagPathKeys(
  tags: ReadonlyArray<{ id: string; title: unknown; parentId: unknown }>,
): Map<string, string> {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const keys = new Map<string, string>();
  for (const tag of tags) {
    const titles: string[] = [];
    const seen = new Set<string>();
    let current: (typeof tags)[number] | undefined = tag;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      titles.unshift(String(current.title ?? '').trim());
      current = typeof current.parentId === 'string' ? byId.get(current.parentId) : undefined;
    }
    keys.set(tag.id, titles.join('\u0000'));
  }
  return keys;
}

/**
 * 包内 Tag → 目标 id：路径命中现有 Tag 的映射到它（返回这些包内 id），
 * 其余换新 id。
 */
function mapTags(
  source: readonly DataPackageEntity[],
  existing: ImportTarget['tags'],
  map: Map<string, string>,
  newId: () => string,
): Set<string> {
  const existingByPath = new Map<string, string>();
  for (const [id, key] of tagPathKeys(existing)) {
    if (!existingByPath.has(key)) existingByPath.set(key, id);
  }
  const merged = new Set<string>();
  const sourceKeys = tagPathKeys(
    source.map((row) => ({ id: row.id, title: row.fields.title, parentId: row.fields.parentId })),
  );
  for (const row of source) {
    const existingId = existingByPath.get(sourceKeys.get(row.id)!);
    if (existingId) {
      map.set(row.id, existingId);
      merged.add(row.id);
    } else {
      map.set(row.id, newId());
    }
  }
  return merged;
}

/** 父 Tag 在子 Tag 之前（包内父级缺失或成环的当作顶层）。 */
function topologicalTags(tags: readonly DataPackageEntity[]): DataPackageEntity[] {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const ordered: DataPackageEntity[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (tag: DataPackageEntity) => {
    if (state.has(tag.id)) return;
    state.set(tag.id, 'visiting');
    const parent =
      typeof tag.fields.parentId === 'string' ? byId.get(tag.fields.parentId) : undefined;
    if (parent && !state.has(parent.id)) visit(parent);
    state.set(tag.id, 'done');
    ordered.push(tag);
  };
  tags.forEach(visit);
  return ordered;
}

/**
 * 追加到现有行之后的 Position（`entity:包内 id` → 覆盖字段）。按包内原
 * 顺序排序后整体接在目标末尾；feed 键空间里任务与项目一起排。
 */
function appendedPositions(
  kept: ReadonlyMap<SyncEntity, DataPackageEntity[]>,
  last: ImportTarget['lastPositions'],
): Map<string, Record<string, string>> {
  const overrides = new Map<string, Record<string, string>>();
  const assign = (key: string, field: string, value: string) => {
    overrides.set(key, { ...overrides.get(key), [field]: value });
  };
  const positioned = (row: DataPackageEntity) => ({
    id: row.id,
    position: typeof row.fields.position === 'string' ? row.fields.position : null,
  });

  for (const entity of APPENDED_ENTITIES) {
    const sorted = sortByEffectivePosition((kept.get(entity) ?? []).map(positioned));
    const next = positionsBetween(last[entity] ?? null, null, sorted.length);
    sorted.forEach((row, index) => assign(`${entity}:${row.id}`, 'position', next[index]));
  }

  // feed：任务用 Position，项目用 Feed Position（缺省退回 Position）。每个
  // 导入项目都写 Feed Position，混排结果不依赖重新生成的项目 Position。
  const feed = [
    ...(kept.get('task') ?? []).map((row) => ({
      key: `task:${row.id}`,
      field: 'position',
      id: row.id,
      position: positioned(row).position,
    })),
    ...(kept.get('project') ?? []).map((row) => ({
      key: `project:${row.id}`,
      field: 'feedPosition',
      id: row.id,
      position: feedSortKey({
        position: positioned(row).position,
        feedPosition: typeof row.fields.feedPosition === 'string' ? row.fields.feedPosition : null,
      }),
    })),
  ];
  const sortedFeed = sortByEffectivePosition(feed);
  const feedLast = maxPosition(last.feed ?? null, last.task ?? null);
  const nextFeed = positionsBetween(feedLast, null, sortedFeed.length);
  sortedFeed.forEach((row, index) => assign(row.key, row.field, nextFeed[index]));
  return overrides;
}

function maxPosition(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
