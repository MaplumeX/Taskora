/**
 * 快速添加浮层的数据快照（quick-add-android issue 02；浮层改为内嵌
 * WebView 后为 v2）。
 *
 * 浮层（QuickAddActivity）是独立的 WebView，跑与桌面 quick-add 窗口同一张
 * QuickAddCard，但没有 Engine，也不与主 WebView 共享 localStorage。这里把
 * 卡片要读的实体（项目 / 区域 / Tag 的完整 DTO）和偏好（账号时区、周起始、
 * 语言、主题）写进 SharedPreferences；浮层打开时原样读出，按查询键写进
 * React Query 缓存（同桌面 quick-add-client），字段选择器零改动。
 *
 * 快照可能过期（进程被杀后浮层读的是上一次的）；落库时由共用的
 * createFromQuickAddDraft 校验引用，所以过期也安全。
 */

import { invoke } from '@tauri-apps/api/core';

import type { AreaResponseDto, ProjectResponseDto, TagResponseDto } from '@taskora/shared';
import {
  getAreas,
  getProjects,
  getTags,
  usePreferencesStore,
  type Language,
  type ThemeMode,
} from '@taskora/api';

/** 快照格式版本：浮层按版本解析，不认识的版本当作没有快照。 */
export const QUICK_ADD_SNAPSHOT_VERSION = 2;

export interface QuickAddSnapshot {
  v: typeof QUICK_ADD_SNAPSHOT_VERSION;
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  tags: TagResponseDto[];
  /** 账号时区：卡片按它计算「今天」。 */
  timeZone: string;
  weekStartsOn: 0 | 1;
  language: Language;
  /** 主题设置；'system' 时由浮层按系统深浅色解析。 */
  theme: ThemeMode;
}

export type QuickAddSnapshotInput = Omit<QuickAddSnapshot, 'v'>;

export function buildQuickAddSnapshot(input: QuickAddSnapshotInput): QuickAddSnapshot {
  return { v: QUICK_ADD_SNAPSHOT_VERSION, ...input };
}

/** 浮层侧解析；版本不符或内容损坏时返回 null（卡片照常可用，只能进 Inbox）。 */
export function parseQuickAddSnapshot(raw: string | null | undefined): QuickAddSnapshot | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as Partial<QuickAddSnapshot> | null;
    if (snapshot?.v !== QUICK_ADD_SNAPSHOT_VERSION) return null;
    if (!Array.isArray(snapshot.projects) || !Array.isArray(snapshot.areas)) return null;
    if (!Array.isArray(snapshot.tags)) return null;
    return snapshot as QuickAddSnapshot;
  } catch {
    return null;
  }
}

/**
 * 从当前数据源（Engine 装配后即本地副本）读取并推给原生。原生侧内容未变
 * 时不写盘，这里每次都发即可（状态栏关闭时 SharedPreferences 被清空，
 * JS 侧缓存会失真）。
 */
export async function syncQuickAddData(): Promise<void> {
  const [projects, areas, tags] = await Promise.all([getProjects(), getAreas(), getTags()]);
  const { timeZone, weekStartsOn, language, theme } = usePreferencesStore.getState();
  const snapshot = buildQuickAddSnapshot({
    projects,
    areas,
    tags,
    timeZone,
    weekStartsOn,
    language,
    theme,
  });
  await invoke('plugin:statusbar|set_quick_add_data', {
    args: { data: JSON.stringify(snapshot) },
  });
}
