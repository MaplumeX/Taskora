import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import {
  buildTagPickerRows,
  selectableRows,
  tagSelectionState,
  toggleTagAcross,
} from './tagPickerOptions';

const NOW = '2026-09-01T00:00:00.000Z';

function tag(id: string, title: string, tagGroupId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', sortOrder: 0, tagGroupId, createdAt: NOW, updatedAt: NOW };
}

const tags = [
  tag('urgent', 'Urgent'),
  tag('office', 'Office', 'g-place'),
  tag('home', 'Home', 'g-place'),
  tag('low', 'Low energy', 'g-energy'),
];
const groups = [
  { id: 'g-place', title: 'Place' },
  { id: 'g-energy', title: 'Energy' },
  { id: 'g-empty', title: 'Empty' },
];

const describeRows = (query: string) =>
  buildTagPickerRows({ tags, groups, query }).map((row) =>
    row.kind === 'header'
      ? `# ${row.title}`
      : row.kind === 'tag'
        ? row.tag.title
        : `+ ${row.title}`,
  );

describe('buildTagPickerRows', () => {
  it('无搜索词：按 Group 分节（跳过空 Group），未分组的放最后', () => {
    expect(describeRows('')).toEqual([
      '# Place',
      'Office',
      'Home',
      '# Energy',
      'Low energy',
      'Urgent',
    ]);
  });

  it('有搜索词：扁平结果，前缀命中在前，末尾可新建', () => {
    expect(describeRows('o')).toEqual(['Office', 'Home', 'Low energy', '+ o']);
  });

  it('与已有 Tag 同名（大小写、空白不同）时不出现新建项', () => {
    expect(describeRows('  urgent ')).toEqual(['Urgent']);
  });

  it('selectableRows 去掉小标题', () => {
    expect(selectableRows(buildTagPickerRows({ tags, groups, query: '' }))).toHaveLength(4);
  });
});

describe('批量打标', () => {
  const items = [
    { id: 't1', tagIds: ['urgent', 'home'] },
    { id: 't2', tagIds: ['urgent'] },
    { id: 't3', tagIds: [] },
  ];

  it('三态', () => {
    expect(tagSelectionState(items, 'urgent')).toBe('some');
    expect(tagSelectionState(items.slice(0, 2), 'urgent')).toBe('all');
    expect(tagSelectionState(items, 'office')).toBe('none');
  });

  it('部分有：给缺少的项加上，保留各自原有 Tag', () => {
    expect(toggleTagAcross(items, 'urgent')).toEqual([{ id: 't3', tagIds: ['urgent'] }]);
  });

  it('全部有：从每一项去掉', () => {
    expect(toggleTagAcross(items.slice(0, 2), 'urgent')).toEqual([
      { id: 't1', tagIds: ['home'] },
      { id: 't2', tagIds: [] },
    ]);
  });
});
