import { describe, expect, it, vi } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { buildQuickAddSnapshot, parseQuickAddSnapshot } from './quick-add-snapshot';

const NOW = '2026-09-01T00:00:00.000Z';

const tag: TagResponseDto = {
  id: 't1',
  title: 'Urgent',
  color: '#3B82F6',
  parentId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const input = {
  projects: [],
  areas: [],
  tags: [tag],
  timeZone: 'Asia/Shanghai',
  weekStartsOn: 1 as const,
  language: 'zh' as const,
  theme: 'system' as const,
};

describe('quick add snapshot', () => {
  it('带版本，原样携带实体与偏好', () => {
    expect(buildQuickAddSnapshot(input)).toEqual({ v: 2, ...input });
  });

  it('浮层解析：往返一致', () => {
    const snapshot = buildQuickAddSnapshot(input);
    expect(parseQuickAddSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('浮层解析：缺失、损坏、旧版本（v1 原生格式）一律当作没有快照', () => {
    expect(parseQuickAddSnapshot(null)).toBeNull();
    expect(parseQuickAddSnapshot('{not json')).toBeNull();
    expect(parseQuickAddSnapshot(JSON.stringify({ v: 1, placements: [], tags: [] }))).toBeNull();
    expect(parseQuickAddSnapshot(JSON.stringify({ v: 2, projects: [], areas: [] }))).toBeNull();
  });
});
