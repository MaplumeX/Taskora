/**
 * 数据包（Data Package）：`.taskora` 文件，导出 / 导入的唯一格式
 * （`.scratch/data-import/spec.md`）。zip 内含：
 *
 * - `manifest.json`：DataPackageManifest
 * - `data.json`：DataPackageData
 * - `blobs/<sha256>`：附件文件内容（manifest.includesBlobs 时）
 *
 * 实体用同步 wire 格式（不含时钟），字段定义以 engine 的 ENTITIES 为准。
 * 结构变化时递增 DATA_PACKAGE_FORMAT，导入侧逐级迁移旧 format。
 */

/** 当前数据包 format；导入拒绝更高的 format。 */
export const DATA_PACKAGE_FORMAT = 1;

export const DATA_PACKAGE_EXTENSION = '.taskora';
export const DATA_PACKAGE_MANIFEST_PATH = 'manifest.json';
export const DATA_PACKAGE_DATA_PATH = 'data.json';
export const DATA_PACKAGE_BLOB_DIR = 'blobs/';

export interface DataPackageManifest {
  format: number;
  /** 每次导出唯一，导入据此提示「已导入过」。 */
  exportId: string;
  exportedAt: string;
  /** 导出时 hub 的 app 版本。 */
  hubVersion: string;
  includesBlobs: boolean;
  /** 各同步实体的条数，以及 calendarSubscriptions、blobs。 */
  counts: Record<string, number>;
}

/** 一条同步实体：id + wire 字段（不含时钟）。 */
export interface DataPackageEntity {
  id: string;
  fields: Record<string, unknown>;
}

/** 日历订阅只带用户填写的部分，拉取状态不导出。 */
export interface DataPackageCalendarSubscription {
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface DataPackageData {
  /** 按同步实体名（task / project / project-heading …）分组。 */
  entities: Record<string, DataPackageEntity[]>;
  preferences: Record<string, unknown> | null;
  calendarSubscriptions: DataPackageCalendarSubscription[];
}

/** 数据包读不了的原因（导入接口 422 的 message）。 */
export type DataPackageErrorCode = 'invalid-package' | 'unsupported-format' | 'blob-mismatch';

/** 导入时跳过的原因。 */
export type DataImportSkipReason =
  'missing-parent' | 'missing-blob' | 'duplicate-calendar' | 'unknown-entity';

/** 导入结果：按同步实体名计的新建条数、合并的 Tag 数、按原因计的跳过条数。 */
export interface DataImportStats {
  created: Record<string, number>;
  mergedTags: number;
  skipped: Partial<Record<DataImportSkipReason, number>>;
}

/** 上传后的预览（`POST /users/me/import/preview`）。 */
export interface DataImportPreview {
  uploadId: string;
  manifest: Pick<
    DataPackageManifest,
    'format' | 'exportedAt' | 'hubVersion' | 'includesBlobs' | 'counts'
  >;
  /** 同一数据包上次导入的时刻；从未导入为 null。 */
  alreadyImportedAt: string | null;
}
