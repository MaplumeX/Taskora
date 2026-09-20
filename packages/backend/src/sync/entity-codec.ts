/**
 * 实体编解码器 — 同步 wire 格式 ↔ Prisma 行的双向映射。
 *
 * wire 字段名与 Prisma 列名一致（契约测试对齐，ADR-0007），例外：
 * - tagIds：hub 侧物化为关系表（TaskTag/ProjectTag/AreaTag）；
 * - 日期：wire 为 ISO 字符串，Prisma 为 Date；
 * - position：legacy 行（REST 创建、尚未被设备写过）为 null 时，
 *   由 sortOrder + createdAt 合成确定性 Position，保证新旧排序一致。
 */

import {
  formatHlc,
  positionsBetween,
  type EntityDef,
  type FieldClocks,
  type SyncEntity,
  ENTITIES,
} from '@taskora/engine';
import { Prisma } from '@prisma/client';
import {
  HeadingStatus,
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';

/** 虚拟设备 0（Assistant / hub 合成基线），ADR-0007。 */
export const VIRTUAL_DEVICE_ID = '0';

export interface EntityCodec {
  entity: SyncEntity;
  def: EntityDef;
  /** Prisma model 名（PrismaService 上的委托属性）。 */
  model: string;
  /** wire 字段中的日期字段（ISO 字符串 ↔ Date）。 */
  dateFields: Set<string>;
  /** wire 字段中的枚举字段及其合法值。 */
  enumFields: Record<string, Set<string>>;
  /** tagIds 物化关系（无则 tagIds 不存在）。 */
  tagRelation?: { model: string; fk: string; relation: string };
}

const CODECS: Record<SyncEntity, EntityCodec> = {
  task: {
    entity: 'task',
    def: ENTITIES.task,
    model: 'task',
    dateFields: new Set([
      'scheduledDate',
      'dueDate',
      'settledAt',
      'trashedAt',
      'createdAt',
      'updatedAt',
    ]),
    enumFields: {
      bucket: new Set(Object.values(TaskBucket)),
      scheduledType: new Set(Object.values(ScheduledType)),
      status: new Set(Object.values(TaskStatus)),
    },
    tagRelation: { model: 'taskTag', fk: 'taskId', relation: 'tags' },
  },
  subtask: {
    entity: 'subtask',
    def: ENTITIES.subtask,
    model: 'subtask',
    dateFields: new Set(['settledAt', 'createdAt', 'updatedAt']),
    enumFields: { status: new Set(Object.values(TaskStatus)) },
  },
  project: {
    entity: 'project',
    def: ENTITIES.project,
    model: 'project',
    dateFields: new Set([
      'scheduledDate',
      'dueDate',
      'completedAt',
      'trashedAt',
      'createdAt',
      'updatedAt',
    ]),
    enumFields: {
      status: new Set(Object.values(ProjectStatus)),
      bucket: new Set(Object.values(ProjectBucket)),
      scheduledType: new Set(Object.values(ScheduledType)),
    },
    tagRelation: { model: 'projectTag', fk: 'projectId', relation: 'tags' },
  },
  'project-heading': {
    entity: 'project-heading',
    def: ENTITIES['project-heading'],
    model: 'projectHeading',
    dateFields: new Set(['completedAt', 'createdAt', 'updatedAt']),
    enumFields: { status: new Set(Object.values(HeadingStatus)) },
  },
  area: {
    entity: 'area',
    def: ENTITIES.area,
    model: 'area',
    dateFields: new Set(['createdAt', 'updatedAt']),
    enumFields: {},
    tagRelation: { model: 'areaTag', fk: 'areaId', relation: 'tags' },
  },
  tag: {
    entity: 'tag',
    def: ENTITIES.tag,
    model: 'tag',
    dateFields: new Set(['createdAt', 'updatedAt']),
    enumFields: {},
  },
  'tag-group': {
    entity: 'tag-group',
    def: ENTITIES['tag-group'],
    model: 'tagGroup',
    dateFields: new Set(['createdAt', 'updatedAt']),
    enumFields: {},
  },
};

export function codecFor(entity: SyncEntity): EntityCodec {
  return CODECS[entity];
}

// ---------- Prisma 行读取 ----------

export type PrismaRow = Record<string, unknown>;
type PrismaDelegate = {
  findUnique(args: unknown): Promise<PrismaRow | null>;
  findMany(args: unknown): Promise<PrismaRow[]>;
  create(args: unknown): Promise<PrismaRow>;
  createMany(args: unknown): Promise<{ count: number }>;
  update(args: unknown): Promise<PrismaRow>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};

/** 经 PrismaService 委托读取（写入走扩展客户端、产生 Change Events）。 */
export function delegate(prisma: unknown, model: string): PrismaDelegate {
  return (prisma as Record<string, PrismaDelegate>)[model];
}

export function includeFor(
  codec: EntityCodec,
): Record<string, { select: { tagId: boolean } }> | undefined {
  return codec.tagRelation
    ? { [codec.tagRelation.relation]: { select: { tagId: true } } }
    : undefined;
}

export async function loadRow(
  prisma: unknown,
  codec: EntityCodec,
  id: string,
): Promise<PrismaRow | null> {
  return delegate(prisma, codec.model).findUnique({
    where: { id },
    include: includeFor(codec),
  });
}

export async function loadAllRows(
  prisma: unknown,
  codec: EntityCodec,
  userId: string,
): Promise<PrismaRow[]> {
  // Subtask 没有 userId 列：经父 Task 过滤（ADR-0005 同样的路由思路）。
  const where = codec.entity === 'subtask' ? { task: { userId } } : { userId };
  return delegate(prisma, codec.model).findMany({ where, include: includeFor(codec) });
}

// ---------- 序列化（Prisma 行 → wire 合并态） ----------

export interface SerializedState {
  fields: Record<string, unknown>;
  clocks: FieldClocks;
  digests: Record<string, string>;
}

/**
 * Prisma 行 → wire 合并态。
 *
 * 时钟基线（ensureClocks）：
 * - 设备推过的字段有 HLC 时钟 + 值摘要，摘要匹配 → 时钟有效；
 * - REST 写绕过合并器改动某字段 → 摘要不匹配 → 仅该字段以虚拟设备 0
 *   在行 updatedAt 时刻重置基线（值新者胜，字段间互不牵连）；
 * - 全新 legacy 行 → 所有字段取基线。
 */
export function serializeRow(codec: EntityCodec, row: PrismaRow): SerializedState {
  const rowWall = (row.updatedAt as Date).getTime();
  const storedClocks = (row.fieldClocks ?? {}) as FieldClocks;
  const storedDigests = (row.fieldDigests ?? {}) as Record<string, string>;

  const fields: Record<string, unknown> = {};
  const clocks: FieldClocks = { ...storedClocks };
  const digests: Record<string, string> = { ...storedDigests };

  for (const field of codec.def.fields) {
    const wireValue = wireValueOf(codec, row, field.name);
    fields[field.name] = wireValue;
    const digest = digestOf(wireValue);
    if (storedDigests[field.name] === digest) continue; // 时钟仍为此值背书
    clocks[field.name] = formatHlc({ wallMs: rowWall, counter: 0, deviceId: VIRTUAL_DEVICE_ID });
    digests[field.name] = digest;
  }

  // legacy 行（REST 创建、position 为 null）合成确定性 Position：
  // 整数部分编码 sortOrder，分数部分按 createdAt 降序编码——与 REST
  // 列表的 (sortOrder asc, createdAt desc) 排序完全一致。
  if (codec.def.orderField === 'position' && fields.position == null) {
    fields.position = synthPosition(
      typeof row.sortOrder === 'number' ? row.sortOrder : 0,
      row.createdAt as Date,
    );
  }

  return { fields, clocks, digests };
}

function wireValueOf(codec: EntityCodec, row: PrismaRow, fieldName: string): unknown {
  if (fieldName === 'tagIds' && codec.tagRelation) {
    const relationRows = (row[codec.tagRelation.relation] ?? []) as Array<{ tagId: string }>;
    return relationRows.map((entry) => entry.tagId).sort();
  }
  const value = row[fieldName];
  return codec.dateFields.has(fieldName) && value instanceof Date ? value.toISOString() : value;
}

function digestOf(value: unknown): string {
  return JSON.stringify(value) ?? 'null';
}

// ---------- Position 合成 ----------

const MAX_TS = 4_102_444_800_000; // 2100-01-01，分数编码的值域上界
const BASE_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const FRACTION_WIDTH = 9;

const intKeyCache = new Map<number, string>();

function intToPositionKey(intValue: number): string {
  let key = intKeyCache.get(intValue);
  if (key === undefined) {
    const keys = positionsBetween(null, null, intValue + 1);
    key = keys[intValue];
    intKeyCache.set(intValue, key);
  }
  return key;
}

function toBase62(value: number): string {
  let digits = '';
  let rest = value;
  do {
    digits = BASE_62[rest % 62] + digits;
    rest = Math.floor(rest / 62);
  } while (rest > 0);
  return digits;
}

/**
 * 合成 Position：整数部分 = sortOrder，分数部分 = (MAX_TS - createdAt)
 * 的定宽 base62 + 非零哨兵（防尾零）。createdAt 越大排越前（REST 排序
 * 的 createdAt desc 语义）。纯函数，重复序列化结果稳定。
 */
export function synthPosition(sortOrder: number, createdAt: Date): string {
  const descending = toBase62(Math.max(0, MAX_TS - createdAt.getTime()));
  return intToPositionKey(Math.max(0, sortOrder)) + descending.padStart(FRACTION_WIDTH, '0') + '1';
}

// ---------- 合并态 → Prisma 写数据 ----------

/**
 * DMMF 派生：模型名（小写）→ 不可为 null 的列集合。
 *
 * 注册表（entities.ts）面向 SQLite 副本、字段一律可空；Prisma 侧却有
 * 不可空列（如 Task.sortOrder Int @default(0)）。设备事件里这些列的
 * null 值若照透传，unchecked create/update 校验会失败（错误常被
 * Prisma 报成 checked 变体的「Argument user is missing」，极具迷惑性
 * —— v0.4.2「同步后任务变 Inbox」事故的第二根因），因此 null 一律
 * 剔除、交给 Prisma 列默认值。契约测试保证 DMMF 与注册表对齐。
 */
const NON_NULLABLE_COLUMNS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, ReadonlySet<string>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const columns = new Set<string>();
    for (const field of model.fields) {
      if ((field.kind === 'scalar' || field.kind === 'enum') && !field.isList && field.isRequired) {
        columns.add(field.name);
      }
    }
    map.set(model.name.toLowerCase(), columns);
  }
  return map;
})();

/**
 * 把（合并后胜出的）wire 字段转换为 Prisma 写数据。
 * 无效日期/非法枚举字段被静默剔除（设备侧 bug 不应击穿 hub）。
 *
 * mode（默认 'update'）：
 * - 'create'：tagIds 物化为纯 `{ create: [...] }`——Prisma 的 create
 *   嵌套输入（*CreateNestedManyWithout*）不接受 deleteMany，且出现
 *   嵌套关系写会让 Prisma 把整份数据按 checked 输入（要求 user
 *   connect、拒绝裸 userId）校验，直接抛错（v0.4.2 「同步后任务变
 *   Inbox」事故的根因）；
 * - 'update'：`{ deleteMany: {}, create: [...] }` 整组替换，语义不变。
 */
export function toPrismaData(
  codec: EntityCodec,
  fields: Record<string, unknown>,
  appliedFields: string[],
  mode: 'create' | 'update' = 'update',
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const fieldName of appliedFields) {
    if (fieldName === 'tagIds' && codec.tagRelation) {
      const tagIds = fields[fieldName];
      if (!Array.isArray(tagIds) || tagIds.some((id) => typeof id !== 'string')) continue;
      const create = tagIds.map((tagId) => ({ tagId }));
      data[codec.tagRelation.relation] =
        mode === 'create' ? { create } : { deleteMany: {}, create };
      continue;
    }
    const value = fields[fieldName];
    // 不可空列不接受 null（sortOrder 等）：剔除，交给 Prisma 列默认值
    if (value === null && NON_NULLABLE_COLUMNS.get(codec.model.toLowerCase())?.has(fieldName)) {
      continue;
    }
    if (codec.dateFields.has(fieldName)) {
      if (value === null) {
        data[fieldName] = null;
      } else if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        data[fieldName] = new Date(value);
      } else {
        continue; // 无效日期：剔除
      }
      continue;
    }
    const enumValues = codec.enumFields[fieldName];
    if (enumValues) {
      if (typeof value !== 'string' || !enumValues.has(value)) continue;
      data[fieldName] = value;
      continue;
    }
    data[fieldName] = value;
  }
  return data;
}
