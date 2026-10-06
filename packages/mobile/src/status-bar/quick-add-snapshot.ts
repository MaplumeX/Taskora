/**
 * 快速添加浮层的数据快照（quick-add-android issue 02）。
 *
 * 原生浮层（QuickAddActivity）没有数据也不跑业务逻辑：归属列表的顺序、
 * 稍后项目的过滤、Tag 的层级都在这里算好，扁平成行列表写进
 * SharedPreferences，原生只负责读取与展示（按标题过滤除外）。顺序与桌面 /
 * 主应用的选择器同源（buildMoveTargets / buildTagPickerRows）。
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
  i18n,
  projectLaterKind,
  usePreferencesStore,
} from '@taskora/api';
import { buildMoveTargets } from '@taskora/ui/components/task/fields/moveTargets';
import { buildTagPickerRows } from '@taskora/ui/components/task/fields/tagPickerOptions';

/** 快照格式版本：原生按版本解析，不认识的版本当作没有快照。 */
export const QUICK_ADD_SNAPSHOT_VERSION = 1;

export type QuickAddPlacementRow =
  | { kind: 'inbox'; title: string; depth: 0 }
  | { kind: 'area' | 'project'; id: string; title: string; depth: 0 | 1 };

/**
 * Tag 行按 Tag 树先序排列，depth 为嵌套层级（嵌套 Tag，ADR-0016）。旧版
 * 快照的 header 行（Tag Group 小标题）已不再产出，原生解析时跳过。
 */
export interface QuickAddTagRow {
  kind: 'tag';
  id: string;
  title: string;
  color: string | null;
  depth: number;
}

export interface QuickAddNativeSnapshot {
  v: typeof QUICK_ADD_SNAPSHOT_VERSION;
  /** 账号时区：浮层按它计算「今天」「明天」「周末」。 */
  timeZone: string;
  /** 0 = 周日，1 = 周一（日期选择器的一周起始）。 */
  weekStartsOn: 0 | 1;
  placements: QuickAddPlacementRow[];
  tags: QuickAddTagRow[];
  /** 浮层全部文案（原生不内置翻译）。 */
  texts: Record<string, string>;
}

type Translate = (key: string) => string;

export interface QuickAddSnapshotInput {
  projects: ProjectResponseDto[];
  areas: AreaResponseDto[];
  tags: TagResponseDto[];
  timeZone: string;
  weekStartsOn: 0 | 1;
  t: Translate;
  /** 稍后项目判定（按账号时区的今天）；稍后项目不进归属列表。 */
  isLater: (project: ProjectResponseDto) => boolean;
}

/** 浮层文案（键名与 QuickAddActivity 读取的一致）。 */
export function quickAddTexts(t: Translate): Record<string, string> {
  return {
    addNotes: t('statusbar:quickAddAddNotes'),
    notesHint: t('task:notePlaceholder'),
    today: t('common:today'),
    tomorrow: t('statusbar:quickAddTomorrow'),
    weekend: t('statusbar:quickAddWeekend'),
    someday: t('nav:someday'),
    pickDate: t('statusbar:quickAddPickDate'),
    inbox: t('nav:inbox'),
    tags: t('task:tags'),
    search: t('statusbar:quickAddSearch'),
    done: t('common:done'),
    continuous: t('statusbar:quickAddContinuous'),
    continueInApp: t('statusbar:quickAddContinueInApp'),
    added: t('statusbar:quickAddAdded'),
  };
}

export function buildQuickAddSnapshot(input: QuickAddSnapshotInput): QuickAddNativeSnapshot {
  const placements: QuickAddPlacementRow[] = buildMoveTargets({
    query: '',
    projects: input.projects,
    areas: input.areas,
    inboxNames: [],
    isLater: input.isLater,
  }).flatMap((target): QuickAddPlacementRow[] => {
    switch (target.kind) {
      case 'inbox':
        return [{ kind: 'inbox', title: input.t('nav:inbox'), depth: 0 }];
      case 'area':
        return [
          {
            kind: 'area',
            id: target.area.id,
            title: target.area.title || input.t('area:newItemPlaceholder'),
            depth: 0,
          },
        ];
      case 'project':
        if (target.later) return [];
        return [
          {
            kind: 'project',
            id: target.project.id,
            title: target.project.title || input.t('project:newItemPlaceholder'),
            depth: target.nested ? 1 : 0,
          },
        ];
    }
  });

  const tags = buildTagPickerRows({ tags: input.tags, query: '' }).flatMap(
    (row): QuickAddTagRow[] =>
      row.kind === 'tag'
        ? [
            {
              kind: 'tag',
              id: row.id,
              title: row.tag.title,
              color: row.tag.color ?? null,
              depth: row.depth,
            },
          ]
        : [],
  );

  return {
    v: QUICK_ADD_SNAPSHOT_VERSION,
    timeZone: input.timeZone,
    weekStartsOn: input.weekStartsOn,
    placements,
    tags,
    texts: quickAddTexts(input.t),
  };
}

/**
 * 从当前数据源（Engine 装配后即本地副本）读取并推给原生。原生侧内容未变
 * 时不写盘，这里每次都发即可（状态栏关闭时 SharedPreferences 被清空，
 * JS 侧缓存会失真）。
 */
export async function syncQuickAddData(): Promise<void> {
  const [projects, areas, tags] = await Promise.all([getProjects(), getAreas(), getTags()]);
  const { timeZone, weekStartsOn } = usePreferencesStore.getState();
  const snapshot = buildQuickAddSnapshot({
    projects,
    areas,
    tags,
    timeZone,
    weekStartsOn,
    t: (key) => i18n.t(key),
    isLater: (project) => projectLaterKind(project) !== null,
  });
  await invoke('plugin:statusbar|set_quick_add_data', {
    args: { data: JSON.stringify(snapshot) },
  });
}
