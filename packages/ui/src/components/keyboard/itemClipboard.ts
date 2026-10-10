/**
 * 条目剪贴板（⌘C / ⌘V / ⌥⌘V，对齐 Things 的 Copy / Paste / Move copied item
 * to here）：⌘C 把选中的任务 / 项目记在本机内存里，同时把标题（每行一个）
 * 写进系统剪贴板。⌘V 读系统剪贴板：仍是复制时写入的那段文字 → 粘贴这些
 * 条目的副本；否则是外部文字 → 每行建一个任务。
 */

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { SelectionRowItem } from '@taskora/api';

import type { SidebarDropPayload, SidebarDropTarget } from '@/components/layout/sidebarDrop';

export interface CopiedItem {
  id: string;
  kind: 'task' | 'project';
  /** 复制时的字段快照。 */
  item: SelectionRowItem;
  tagIds: string[];
}

export interface CopiedItems {
  items: CopiedItem[];
  /** 写进系统剪贴板的文字：据此判断剪贴板是否仍是这次复制。 */
  text: string;
}

let copied: CopiedItems | null = null;

export function setCopiedItems(items: CopiedItem[]): CopiedItems {
  copied = {
    items,
    text: items.map(({ item }) => item.title ?? '').join('\n'),
  };
  return copied;
}

export function getCopiedItems(): CopiedItems | null {
  return copied;
}

/** 测试用：清空条目剪贴板。 */
export function resetCopiedItems(): void {
  copied = null;
}

/** 行首的列表记号：`- ` / `* ` / `• ` / `1. ` / `- [ ] ` / `[x] ` 等。 */
const LIST_MARKER = /^(?:[-*•‣◦]\s+|\d+[.)]\s+)?(?:\[[ xX]?\]\s+)?/;

/** 外部文字 → 任务标题：按行拆分，去掉列表记号与首尾空白，丢弃空行。 */
export function titlesFromText(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().replace(LIST_MARKER, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * 当前页作为「放到这里」的落点（同 Sidebar Drop 的落点语义）：Inbox / Today /
 * Anytime / Someday、项目页、区域页；其余页面（Upcoming、Logbook、Trash、
 * 搜索、标签等）没有确定的位置，返回 null。
 */
export function pageDropTarget(pathname: string): SidebarDropTarget | null {
  switch (pathname) {
    case '/inbox':
      return { kind: 'inbox' };
    case '/today':
      return { kind: 'today' };
    case '/anytime':
      return { kind: 'anytime' };
    case '/someday':
      return { kind: 'someday' };
  }
  const project = /^\/projects\/([^/]+)$/.exec(pathname);
  if (project) return { kind: 'project', projectId: project[1] };
  const area = /^\/areas\/([^/]+)$/.exec(pathname);
  if (area) return { kind: 'area', areaId: area[1] };
  return null;
}

/**
 * 复制的条目 → Sidebar Drop 载荷（任务一组；项目逐个）。asCopies 时按
 * 副本处理：id 换成副本 id，状态为未了结（复制出的条目总是未了结的）。
 */
export function dropPayloads(
  items: readonly CopiedItem[],
  copyIds?: readonly string[],
): SidebarDropPayload[] {
  const entries = items.map((entry, index) => ({
    ...entry,
    id: copyIds ? copyIds[index] : entry.id,
    status: copyIds ? TaskStatus.ACTIVE : entry.item.status,
  }));
  const tasks = entries.filter((entry) => entry.kind === 'task' && entry.id);
  const projects = entries.filter((entry) => entry.kind === 'project' && entry.id);
  return [
    ...(tasks.length > 0
      ? [
          {
            kind: 'tasks' as const,
            tasks: tasks.map(({ id, item, status }) => ({
              id,
              projectId: item.projectId ?? null,
              areaId: item.areaId,
              bucket: item.bucket ?? TaskBucket.INBOX,
              scheduledType: item.scheduledType ?? ScheduledType.NONE,
              scheduledDate: item.scheduledDate,
              status,
            })),
          },
        ]
      : []),
    ...projects.map(({ id, item, status }) => ({
      kind: 'project' as const,
      project: {
        id,
        areaId: item.areaId,
        status,
        scheduledType: item.scheduledType,
        scheduledDate: item.scheduledDate,
      },
    })),
  ];
}
