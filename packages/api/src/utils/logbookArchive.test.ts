import { describe, expect, it } from 'vitest';

import type { FeedItem, TaskFeedItem } from '@taskora/shared';

import { mergeLogbookArchive } from './logbookArchive';

const CUTOFF = '2025-09-30T00:00:00.000Z';

function settled(id: string, completedAt: string): TaskFeedItem {
  return { id, type: 'task', completedAt, position: null } as unknown as TaskFeedItem;
}

function ids(items: FeedItem[]): string[] {
  return items.map((item) => item.id);
}

describe('mergeLogbookArchive（local-first-v3 issue 08）', () => {
  const local = [
    settled('recent', '2026-09-01T00:00:00.000Z'),
    // 截止之前、仍在副本里（如进行中项目的旧任务）
    settled('old-local', '2025-03-01T00:00:00.000Z'),
  ];

  it('没有截止（REST 模式）：原样返回本地', () => {
    expect(mergeLogbookArchive(local, [], null, false).items).toBe(local);
  });

  it('还没读归档：截止之前的本地条目先藏起来', () => {
    expect(ids(mergeLogbookArchive(local, [], CUTOFF, false).items)).toEqual(['recent']);
  });

  it('归档页读过它的位置后按时间插回；两边都有的以本地为准', () => {
    const archived = [
      settled('a1', '2025-06-01T00:00:00.000Z'),
      settled('old-local', '2025-03-01T00:00:00.000Z'),
      settled('a2', '2025-02-01T00:00:00.000Z'),
    ];
    const merged = mergeLogbookArchive(local, archived.slice(0, 1), CUTOFF, false);
    expect(ids(merged.items)).toEqual(['recent', 'a1']);
    const more = mergeLogbookArchive(local, archived, CUTOFF, false);
    expect(ids(more.items)).toEqual(['recent', 'a1', 'old-local', 'a2']);
    expect([...more.archivedIds].sort()).toEqual(['a1', 'a2']);
  });

  it('读到底后本地条目全部显示', () => {
    const merged = mergeLogbookArchive(local, [], CUTOFF, true);
    expect(ids(merged.items)).toEqual(['recent', 'old-local']);
  });
});
