import type { SyncEntity } from '@taskora/engine';
import {
  DATA_PACKAGE_FORMAT,
  type DataPackageData,
  type DataPackageErrorCode,
  type DataPackageManifest,
} from '@taskora/shared';

import { codecFor, wireViewOfRow, type PrismaRow } from '../sync/entity-codec';

export class DataPackageError extends Error {
  readonly name = 'DataPackageError';

  constructor(
    readonly code: DataPackageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * format 迁移链：`MIGRATIONS[n]` 把 format n 的内容升到 n + 1。新增 format
 * 时在这里补一步，旧数据包逐级升到 DATA_PACKAGE_FORMAT。
 */
const MIGRATIONS: Record<
  number,
  (pkg: { manifest: DataPackageManifest; data: unknown }) => {
    manifest: DataPackageManifest;
    data: unknown;
  }
> = {
  0: migrateLegacyJson,
};

/** 旧版导出（`taskora-export-*.json`）的顶层数组 → 同步实体名。 */
const LEGACY_COLLECTIONS: Array<[string, SyncEntity]> = [
  ['tasks', 'task'],
  ['projects', 'project'],
  ['areas', 'area'],
  ['tags', 'tag'],
  ['projectHeadings', 'project-heading'],
];

/** 旧版导出：顶层带 `version` 与 `tasks` 数组的 JSON（format 0）。 */
export function isLegacyExport(json: unknown): boolean {
  return isRecord(json) && typeof json.version === 'string' && Array.isArray(json.tasks);
}

/**
 * format 0 → 1：旧版导出是 Prisma 行（JSON 化后日期已是 ISO 串，与 wire
 * 一致），按实体编解码器取 wire 字段——Tag 关系变 tagIds、JSON 列解析、
 * userId / fieldClocks 等非 wire 列丢弃；Subtask 从所属 Task 里拆出。
 * 旧版没有附件与日历订阅。
 */
function migrateLegacyJson(pkg: { manifest: DataPackageManifest; data: unknown }) {
  if (!isRecord(pkg.data)) throw new DataPackageError('invalid-package', '旧版导出结构无效');
  const legacy = pkg.data;
  const wire = (entity: SyncEntity, row: unknown) => {
    if (!isRecord(row) || typeof row.id !== 'string') {
      throw new DataPackageError('invalid-package', '旧版导出结构无效');
    }
    const fields = Object.fromEntries(
      Object.entries(wireViewOfRow(codecFor(entity), row as PrismaRow)).filter(
        ([, value]) => value !== undefined,
      ),
    );
    return { id: row.id, fields };
  };
  const entities: DataPackageData['entities'] = {};
  for (const [key, entity] of LEGACY_COLLECTIONS) {
    const rows = Array.isArray(legacy[key]) ? (legacy[key] as unknown[]) : [];
    entities[entity] = rows.map((row) => wire(entity, row));
  }
  entities.subtask = (legacy.tasks as unknown[]).flatMap((task) =>
    isRecord(task) && Array.isArray(task.subtasks)
      ? task.subtasks.map((row) => wire('subtask', row))
      : [],
  );
  const user = isRecord(legacy.user) ? legacy.user : {};
  return {
    manifest: {
      ...pkg.manifest,
      format: 1,
      counts: Object.fromEntries(
        Object.entries(entities).map(([entity, rows]) => [entity, rows.length]),
      ),
    },
    data: {
      entities,
      preferences: isRecord(user.preferences) ? user.preferences : null,
      calendarSubscriptions: [],
    },
  };
}

/**
 * 校验并升级数据包内容到当前 format。高于当前 format 的拒绝（需要升级
 * hub）；结构不对的拒绝。
 */
export function upgradeDataPackage(
  manifestJson: unknown,
  dataJson: unknown,
): { manifest: DataPackageManifest; data: DataPackageData } {
  if (!isRecord(manifestJson) || typeof manifestJson.format !== 'number') {
    throw new DataPackageError('invalid-package', '缺少有效的 manifest');
  }
  let pkg = { manifest: manifestJson as unknown as DataPackageManifest, data: dataJson };
  if (pkg.manifest.format > DATA_PACKAGE_FORMAT) {
    throw new DataPackageError(
      'unsupported-format',
      `数据包 format ${pkg.manifest.format} 高于本 hub 支持的 ${DATA_PACKAGE_FORMAT}`,
    );
  }
  while (pkg.manifest.format < DATA_PACKAGE_FORMAT) {
    const migrate = MIGRATIONS[pkg.manifest.format];
    if (!migrate) {
      throw new DataPackageError(
        'unsupported-format',
        `不支持的数据包 format ${pkg.manifest.format}`,
      );
    }
    pkg = migrate(pkg);
  }
  return { manifest: pkg.manifest, data: validateData(pkg.data) };
}

function validateData(data: unknown): DataPackageData {
  if (!isRecord(data) || !isRecord(data.entities)) {
    throw new DataPackageError('invalid-package', 'data.json 缺少 entities');
  }
  for (const [entity, rows] of Object.entries(data.entities)) {
    const valid =
      Array.isArray(rows) &&
      rows.every((row) => isRecord(row) && typeof row.id === 'string' && isRecord(row.fields));
    if (!valid) throw new DataPackageError('invalid-package', `entities.${entity} 结构无效`);
  }
  const subscriptions = Array.isArray(data.calendarSubscriptions)
    ? data.calendarSubscriptions.filter(
        (item): item is DataPackageData['calendarSubscriptions'][number] =>
          isRecord(item) &&
          typeof item.name === 'string' &&
          typeof item.url === 'string' &&
          typeof item.color === 'string' &&
          typeof item.enabled === 'boolean',
      )
    : [];
  return {
    entities: data.entities as DataPackageData['entities'],
    preferences: isRecord(data.preferences) ? data.preferences : null,
    calendarSubscriptions: subscriptions,
  };
}
