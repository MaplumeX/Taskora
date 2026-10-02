/**
 * quick-add 中继协议（quick-add-v2 issue 01）：事件名与载荷类型，主窗口
 * （quick-add-relay）与 quick-add 窗口（quick-add-client）共用。
 */

import type {
  AreaResponseDto,
  ProjectResponseDto,
  TagGroupResponseDto,
  TagResponseDto,
} from '@taskora/shared';
import type { QuickAddDraft, QuickAddPlacement } from '@taskora/api';

/** quick-add → 主窗口的提交事件名。 */
export const QUICK_ADD_SUBMIT_EVENT = 'quick-add://submit';
/** quick-add → 主窗口：请求数据快照。 */
export const QUICK_ADD_SNAPSHOT_REQUEST_EVENT = 'quick-add://snapshot-request';
/** 主窗口 → quick-add：数据快照应答。 */
export const QUICK_ADD_SNAPSHOT_EVENT = 'quick-add://snapshot';
/** 主窗口 → quick-add：提交结果回执。 */
export const QUICK_ADD_RESULT_EVENT = 'quick-add://result';

/** quick-add 窗口的 label（tauri.conf.json）。 */
export const QUICK_ADD_WINDOW = 'quick-add';

/** 提交载荷：新版带草稿；旧版（升级过渡期另一端是旧构建）只有标题。 */
export type QuickAddSubmitPayload =
  { draft: QuickAddDraft; requestId?: string } | { title: string };

export interface QuickAddSnapshotRequest {
  requestId: string;
}

export interface QuickAddSnapshot {
  requestId: string;
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  tags: TagResponseDto[];
  tagGroups: TagGroupResponseDto[];
}

export type QuickAddResultPayload =
  | { requestId?: string; ok: true; taskId: string; placedIn: QuickAddPlacement }
  | { requestId?: string; ok: false; title: string };
