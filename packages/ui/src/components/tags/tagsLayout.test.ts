import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import { buildTagsRows, resolveTagsDrop, UNGROUPED_ROW_ID } from './tagsLayout';

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, tagGroupId: string | null = null): TagResponseDto {
  return {
    id,
    title: id,
    color: '#3B82F6',
    tagGroupId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const tags = [tag('a', 'g1'), tag('b', 'g1'), tag('c', 'g2'), tag('x'), tag('y')];
const groups = [
  { id: 'g1', title: 'G1' },
  { id: 'g2', title: 'G2' },
];
const rows = buildTagsRows(tags, groups);

describe('buildTagsRows', () => {
  it('Group 小标题后跟成员，最后是未分组', () => {
    expect(rows.map((row) => row.id)).toEqual([
      'group:g1',
      'tag:a',
      'tag:b',
      'group:g2',
      'tag:c',
      UNGROUPED_ROW_ID,
      'tag:x',
      'tag:y',
    ]);
  });
});

describe('resolveTagsDrop', () => {
  it('同组内调整顺序', () => {
    expect(resolveTagsDrop(rows, 'tag:b', 'tag:a')).toEqual({
      kind: 'tag',
      tagId: 'b',
      groupChange: undefined,
      tagOrder: ['b', 'a', 'c', 'x', 'y'],
    });
  });

  it('跨组拖动改 Group', () => {
    expect(resolveTagsDrop(rows, 'tag:a', 'tag:c')).toMatchObject({
      tagId: 'a',
      groupChange: 'g2',
      tagOrder: ['b', 'c', 'a', 'x', 'y'],
    });
  });

  it('拖进未分组区变为无分组', () => {
    expect(resolveTagsDrop(rows, 'tag:c', 'tag:x')).toMatchObject({
      tagId: 'c',
      groupChange: null,
    });
  });

  it('从未分组拖到组小标题上：进入上一个组的末尾', () => {
    expect(resolveTagsDrop(rows, 'tag:x', 'group:g2')).toMatchObject({
      tagId: 'x',
      groupChange: 'g1',
      tagOrder: ['a', 'b', 'x', 'c', 'y'],
    });
  });

  it('Group 重排；落到未分组区即移到最后', () => {
    expect(resolveTagsDrop(rows, 'group:g1', 'tag:c')).toEqual({
      kind: 'group',
      groupOrder: ['g2', 'g1'],
    });
    expect(resolveTagsDrop(rows, 'group:g1', 'tag:y')).toEqual({
      kind: 'group',
      groupOrder: ['g2', 'g1'],
    });
    expect(resolveTagsDrop(rows, 'group:g2', 'tag:a')).toEqual({
      kind: 'group',
      groupOrder: ['g2', 'g1'],
    });
  });

  it('没有变化时为 null', () => {
    expect(resolveTagsDrop(rows, 'tag:a', 'tag:a')).toBeNull();
    expect(resolveTagsDrop(rows, 'group:g1', 'tag:b')).toBeNull();
  });
});
