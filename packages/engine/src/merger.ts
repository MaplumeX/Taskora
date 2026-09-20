/**
 * 字段级 Last-Writer-Wins 合并器（纯函数）。
 *
 * 每个实体的每个字段独立携带 HLC 时间戳（内含设备 ID 作决胜）。合并语义：
 * 时间戳新者胜，同串（重放/回声）保持现状，败方编辑被静默丢弃——不弹
 * 冲突 UI（ADR-0007 定案语义）。同一纯函数同时运行于设备端（应用拉取的
 * 变更）与 Sync Hub（合并推送的变更），保证任意设备重放合并结果一致。
 */

/** field → HLC 时间戳（内含设备 ID）。 */
export type FieldClocks = Record<string, string>;

/** 一条待合并的字段写入：值 + 时间戳。 */
export interface FieldWrite {
  value: unknown;
  hlc: string;
}

/** 实体当前的合并态（字段值与时钟）。 */
export interface EntityMergeState {
  fields: Record<string, unknown>;
  clocks: FieldClocks;
}

export interface MergeOutcome {
  /** 合并后的字段值（含未变字段的原值）。 */
  fields: Record<string, unknown>;
  /** 合并后的时钟。 */
  clocks: FieldClocks;
  /** 被接受（真正写入）的字段名集合。 */
  appliedFields: string[];
}

/**
 * 把一批字段写入合并进实体的当前合并态。
 *
 * - 当前态为 null（新实体）：全部接受。
 * - 每个字段独立裁决：incoming.hlc > current → 接受；否则丢弃。
 * - 同一时间戳（设备重放/自身回声）：保持现状，幂等。
 */
export function mergeFieldWrites(
  current: EntityMergeState | null,
  incoming: Record<string, FieldWrite>,
): MergeOutcome {
  if (current === null) {
    const fields: Record<string, unknown> = {};
    const clocks: FieldClocks = {};
    for (const [field, write] of Object.entries(incoming)) {
      fields[field] = write.value;
      clocks[field] = write.hlc;
    }
    return { fields, clocks, appliedFields: Object.keys(incoming) };
  }

  const fields: Record<string, unknown> = { ...current.fields };
  const clocks: FieldClocks = { ...current.clocks };
  const appliedFields: string[] = [];

  for (const [field, write] of Object.entries(incoming)) {
    const existing = current.clocks[field];
    if (existing === undefined || write.hlc > existing) {
      fields[field] = write.value;
      clocks[field] = write.hlc;
      appliedFields.push(field);
    }
    // existing >= write.hlc：陈旧或重放，静默丢弃
  }

  return { fields, clocks, appliedFields };
}

/**
 * 用一份远端合并态（pull 下来的完整实体 + 完整时钟）合并进本地合并态。
 * 与 mergeFieldWrites 同一语义：逐字段比较时钟，新者胜。
 */
export function mergeEntityState(
  current: EntityMergeState | null,
  remote: EntityMergeState,
): MergeOutcome {
  // 远端态转成字段写入集，复用同一裁决路径。
  const incoming: Record<string, FieldWrite> = {};
  for (const [field, hlc] of Object.entries(remote.clocks)) {
    incoming[field] = { value: remote.fields[field], hlc };
  }
  return mergeFieldWrites(current, incoming);
}
