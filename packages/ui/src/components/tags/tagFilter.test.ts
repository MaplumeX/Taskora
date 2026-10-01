import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import { collectFilterOptions, filterInOptions, matchesTagFilter } from './tagFilter';

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, tagGroupId: string | null = null): TagResponseDto {
  return {
    id,
    title: id,
    color: '#3B82F6',
    sortOrder: 0,
    tagGroupId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const tags = [
  tag('urgent'),
  tag('office', 'place'),
  tag('home', 'place'),
  tag('low', 'energy'),
  tag('idle'),
];
const groups = [
  { id: 'place', title: 'Place' },
  { id: 'energy', title: 'Energy' },
];

describe('collectFilterOptions', () => {
  it('只收集列表中出现的 Tag；Group 至少出现一个成员才列出', () => {
    const options = collectFilterOptions([['office', 'urgent'], ['home'], []], tags, groups);
    expect(options).toEqual({
      groups: [{ id: 'place', title: 'Place', tags: [tags[1], tags[2]] }],
      tags: [tags[0]],
      untagged: true,
    });
  });

  it('一个 Tag 都没有时为 null', () => {
    expect(collectFilterOptions([[], []], tags, groups)).toBeNull();
  });

  it('全部条目都有 Tag 时没有「无标签」', () => {
    expect(collectFilterOptions([['urgent']], tags, groups)?.untagged).toBe(false);
  });
});

describe('matchesTagFilter', () => {
  it('Tag', () => {
    expect(matchesTagFilter(['urgent'], { kind: 'tag', tagId: 'urgent' }, tags)).toBe(true);
    expect(matchesTagFilter(['home'], { kind: 'tag', tagId: 'urgent' }, tags)).toBe(false);
  });

  it('Group：命中组内任一 Tag；收窄后只看该 Tag', () => {
    const group = { kind: 'group', groupId: 'place', tagId: null } as const;
    expect(matchesTagFilter(['home'], group, tags)).toBe(true);
    expect(matchesTagFilter(['low'], group, tags)).toBe(false);
    expect(matchesTagFilter(['home'], { ...group, tagId: 'office' }, tags)).toBe(false);
  });

  it('无标签', () => {
    expect(matchesTagFilter([], { kind: 'untagged' }, tags)).toBe(true);
    expect(matchesTagFilter(['urgent'], { kind: 'untagged' }, tags)).toBe(false);
  });
});

describe('filterInOptions', () => {
  const options = collectFilterOptions([['office'], ['urgent']], tags, groups);

  it('选中的 Tag / Group 仍在选项里', () => {
    expect(filterInOptions({ kind: 'tag', tagId: 'urgent' }, options)).toBe(true);
    expect(filterInOptions({ kind: 'group', groupId: 'place', tagId: 'office' }, options)).toBe(
      true,
    );
  });

  it('已不在列表中则失效', () => {
    expect(filterInOptions({ kind: 'tag', tagId: 'idle' }, options)).toBe(false);
    expect(filterInOptions({ kind: 'group', groupId: 'place', tagId: 'home' }, options)).toBe(
      false,
    );
    expect(filterInOptions({ kind: 'untagged' }, options)).toBe(false);
  });
});
