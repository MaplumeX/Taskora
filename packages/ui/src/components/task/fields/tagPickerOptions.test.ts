import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import { buildTagPickerRows, tagSelectionState, toggleTagAcross } from './tagPickerOptions';

const NOW = '2026-09-01T00:00:00.000Z';

function tag(id: string, title: string, parentId: string | null = null): TagResponseDto {
  return { id, title, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

const tags = [
  tag('urgent', 'Urgent'),
  tag('place', 'Place'),
  tag('office', 'Office', 'place'),
  tag('desk', 'Desk', 'office'),
  tag('home', 'Home', 'place'),
];

const describeRows = (query: string) =>
  buildTagPickerRows({ tags, query }).map((row) =>
    row.kind === 'tag'
      ? `${'  '.repeat(row.depth)}${row.tag.title}${row.path.length ? ` (${row.path.join(' › ')})` : ''}`
      : `+ ${row.title}`,
  );

describe('buildTagPickerRows', () => {
  it('无搜索词：按 Tag 树先序排列、逐层缩进，父 Tag 也是可选行', () => {
    expect(describeRows('')).toEqual(['Urgent', 'Place', '  Office', '    Desk', '  Home']);
  });

  it('有搜索词：扁平结果带父路径，前缀命中在前，末尾可新建', () => {
    expect(describeRows('e')).toEqual([
      'Urgent',
      'Place',
      'Office (Place)',
      'Desk (Place › Office)',
      'Home (Place)',
      '+ e',
    ]);
    expect(describeRows('d')).toEqual(['Desk (Place › Office)', '+ d']);
  });

  it('与已有 Tag 同名（大小写、空白不同）时不出现新建项', () => {
    expect(describeRows('  urgent ')).toEqual(['Urgent']);
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
