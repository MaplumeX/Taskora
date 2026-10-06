import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import {
  collectFilterOptions,
  filterInOptions,
  filterLevels,
  matchesTagFilter,
  toggleFilterTag,
  type TagFilter,
  type TagFilterOptions,
} from './tagFilter';

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, parentId: string | null = null): TagResponseDto {
  return { id, title: id, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

// work ─ meeting ─ weekly
//      └ travel
// urgent, idle
const tags = [
  tag('work'),
  tag('meeting', 'work'),
  tag('weekly', 'meeting'),
  tag('travel', 'work'),
  tag('urgent'),
  tag('idle'),
];

const ids = (level: TagResponseDto[]) => level.map((t) => t.id);

describe('collectFilterOptions / filterLevels', () => {
  it('自身或后代出现在列表里的 Tag 才列出；第一行是顶层', () => {
    const options = collectFilterOptions([['weekly', 'urgent'], []], tags)!;
    expect(filterLevels(options, []).map(ids)).toEqual([['work', 'urgent']]);
    expect(options.untagged).toBe(true);
  });

  it('选中路径上每一层出现的子 Tag 成为下一行', () => {
    const options = collectFilterOptions([['weekly'], ['travel']], tags)!;
    expect(filterLevels(options, ['work']).map(ids)).toEqual([['work'], ['meeting', 'travel']]);
    expect(filterLevels(options, ['work', 'meeting']).map(ids)).toEqual([
      ['work'],
      ['meeting', 'travel'],
      ['weekly'],
    ]);
    // 叶子 Tag 下面不再多出一行
    expect(filterLevels(options, ['work', 'travel'])).toHaveLength(2);
  });

  it('一个 Tag 都没有时为 null；全部条目都有 Tag 时没有「无标签」', () => {
    expect(collectFilterOptions([[], []], tags)).toBeNull();
    expect(collectFilterOptions([['urgent']], tags)?.untagged).toBe(false);
  });

  it('root：第一行只列 root 的子 Tag，不提供「无标签」', () => {
    const options = collectFilterOptions([['work'], ['weekly'], []], tags, 'work')!;
    expect(filterLevels(options, []).map(ids)).toEqual([['meeting']]);
    expect(options.untagged).toBe(false);
    expect(collectFilterOptions([['work']], tags, 'work')).toBeNull();
  });
});

describe('toggleFilterTag', () => {
  it('选中、下钻、点已选中的退回上一层', () => {
    const top = toggleFilterTag(null, 0, 'work');
    expect(top).toEqual({ kind: 'tag', path: ['work'] });
    const deeper = toggleFilterTag(top, 1, 'meeting');
    expect(deeper).toEqual({ kind: 'tag', path: ['work', 'meeting'] });
    expect(toggleFilterTag(deeper, 1, 'meeting')).toEqual({ kind: 'tag', path: ['work'] });
    expect(toggleFilterTag(deeper, 1, 'travel')).toEqual({ kind: 'tag', path: ['work', 'travel'] });
    expect(toggleFilterTag(deeper, 0, 'work')).toBeNull();
    expect(toggleFilterTag({ kind: 'untagged' }, 0, 'urgent')).toEqual({
      kind: 'tag',
      path: ['urgent'],
    });
  });
});

describe('matchesTagFilter', () => {
  const { forest } = collectFilterOptions([['urgent']], tags)!;

  it('命中选中 Tag 的整棵子树，不命中祖先', () => {
    const work: TagFilter = { kind: 'tag', path: ['work'] };
    expect(matchesTagFilter(['weekly'], work, forest)).toBe(true);
    expect(matchesTagFilter(['work'], work, forest)).toBe(true);
    expect(matchesTagFilter(['urgent'], work, forest)).toBe(false);
    expect(matchesTagFilter(['work'], { kind: 'tag', path: ['work', 'meeting'] }, forest)).toBe(
      false,
    );
  });

  it('无标签', () => {
    expect(matchesTagFilter([], { kind: 'untagged' }, forest)).toBe(true);
    expect(matchesTagFilter(['urgent'], { kind: 'untagged' }, forest)).toBe(false);
  });
});

describe('filterInOptions', () => {
  const options = collectFilterOptions([['weekly'], ['urgent']], tags) as TagFilterOptions;

  it('路径上的 Tag 仍在选项里', () => {
    expect(filterInOptions({ kind: 'tag', path: ['urgent'] }, options)).toBe(true);
    expect(filterInOptions({ kind: 'tag', path: ['work', 'meeting'] }, options)).toBe(true);
  });

  it('不在列表中、或层级已变则失效', () => {
    expect(filterInOptions({ kind: 'tag', path: ['idle'] }, options)).toBe(false);
    expect(filterInOptions({ kind: 'tag', path: ['work', 'travel'] }, options)).toBe(false);
    // meeting 不再是顶层
    expect(filterInOptions({ kind: 'tag', path: ['meeting'] }, options)).toBe(false);
    expect(filterInOptions({ kind: 'untagged' }, options)).toBe(false);
  });
});
