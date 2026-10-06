import { describe, expect, it } from 'vitest';

import type { TagResponseDto } from '@taskora/shared';

import {
  buildTagsRows,
  canNestUnder,
  depthRange,
  dragRows,
  moveRow,
  projectDepth,
  resolveTagsMove,
  resolveTreeDrop,
  type TagsRow,
} from './tagsLayout';
import { tagForest } from './tagTree';

const NOW = '2026-09-01T00:00:00.000Z';
function tag(id: string, parentId: string | null = null): TagResponseDto {
  return { id, title: id, color: '#3B82F6', parentId, createdAt: NOW, updatedAt: NOW };
}

// a ─ a1 ─ a1x
//   └ a2
// b
const forest = tagForest([tag('a'), tag('a1', 'a'), tag('a1x', 'a1'), tag('a2', 'a'), tag('b')]);

describe('buildTagsRows', () => {
  it('先序排列，带层级；折叠的 Tag 不展开子树', () => {
    expect(buildTagsRows(forest).map((row) => [row.id, row.depth, row.hasChildren])).toEqual([
      ['tag:a', 0, true],
      ['tag:a1', 1, true],
      ['tag:a1x', 2, false],
      ['tag:a2', 1, false],
      ['tag:b', 0, false],
    ]);
    expect(buildTagsRows(forest, new Set(['a1'])).map((row) => row.id)).toEqual([
      'tag:a',
      'tag:a1',
      'tag:a2',
      'tag:b',
    ]);
  });
});

const ids = (rows: TagsRow[]) => rows.map((row) => row.tag.id);

describe('dragRows / moveRow', () => {
  const rows = buildTagsRows(forest);

  it('拖起时被拖 Tag 的子树收起', () => {
    expect(ids(dragRows(rows, 'a1'))).toEqual(['a', 'a1', 'a2', 'b']);
    expect(ids(dragRows(rows, 'a'))).toEqual(['a', 'b']);
    expect(ids(dragRows(rows, 'b'))).toEqual(ids(rows));
  });

  it('空位挪到目标行前 / 后；没有变化时为 null', () => {
    const drag = dragRows(rows, 'a1');
    expect(ids(moveRow(drag, 'a1', 'b', 'after')!)).toEqual(['a', 'a2', 'b', 'a1']);
    expect(ids(moveRow(drag, 'a1', 'a', 'before')!)).toEqual(['a1', 'a', 'a2', 'b']);
    expect(moveRow(drag, 'a1', 'a2', 'before')).toBeNull();
    expect(moveRow(drag, 'a1', 'a', 'after')).toBeNull();
    expect(moveRow(drag, 'a1', 'a1', 'after')).toBeNull();
  });
});

describe('depthRange / projectDepth', () => {
  const drag = dragRows(buildTagsRows(forest), 'b');

  it('最深是上一行的子 Tag，最浅不能浅过下一行', () => {
    // b 放在 a1x 与 a2 之间：上一行 a1x（层级 2），下一行 a2（层级 1）
    const between = moveRow(drag, 'b', 'a2', 'before')!;
    expect(depthRange(between, 'b')).toEqual({ min: 1, max: 3 });
    // 最前面：只能是顶层
    expect(depthRange(moveRow(drag, 'b', 'a', 'before')!, 'b')).toEqual({ min: 0, max: 0 });
    // 最后面：0 到上一行的子级
    expect(depthRange(drag, 'b')).toEqual({ min: 0, max: 2 });
  });

  it('横向每满一档缩进加 / 减一层，并夹到可取范围', () => {
    const between = moveRow(drag, 'b', 'a2', 'before')!;
    expect(projectDepth(between, 'b', 0, 0, 20)).toBe(1);
    expect(projectDepth(between, 'b', 0, 45, 20)).toBe(2);
    expect(projectDepth(between, 'b', 0, 200, 20)).toBe(3);
    expect(projectDepth(drag, 'b', 0, -60, 20)).toBe(0);
  });
});

describe('resolveTreeDrop', () => {
  const rows = buildTagsRows(forest);

  it('同级调整顺序', () => {
    const preview = moveRow(dragRows(rows, 'a2'), 'a2', 'a1', 'before')!;
    expect(resolveTreeDrop(forest, preview, 'a2', 1)).toEqual({
      tagId: 'a2',
      parentChange: undefined,
      tagOrder: ['a', 'a2', 'a1', 'a1x', 'b'],
    });
  });

  it('按层级换算新父 Tag，子树跟着一起移动', () => {
    const drag = dragRows(rows, 'a1');
    // 放到最后、拉回顶层
    expect(resolveTreeDrop(forest, moveRow(drag, 'a1', 'b', 'after')!, 'a1', 0)).toEqual({
      tagId: 'a1',
      parentChange: null,
      tagOrder: ['a', 'a2', 'b', 'a1', 'a1x'],
    });
    // 放到 b 后面、往右一层：成为 b 的子 Tag
    expect(resolveTreeDrop(forest, moveRow(drag, 'a1', 'b', 'after')!, 'a1', 1)).toEqual({
      tagId: 'a1',
      parentChange: 'b',
      tagOrder: ['a', 'a2', 'b', 'a1', 'a1x'],
    });
  });

  it('原地往右一层：成为上一个同级的最后一个子 Tag', () => {
    // a2 原地（上一行是 a1x），层级 2 → 成为 a1 的子 Tag，排在 a1x 后面
    expect(resolveTreeDrop(forest, dragRows(rows, 'a2'), 'a2', 2)).toEqual({
      tagId: 'a2',
      parentChange: 'a1',
      tagOrder: ['a', 'a1', 'a1x', 'a2', 'b'],
    });
  });

  it('没有变化时为 null', () => {
    expect(resolveTreeDrop(forest, dragRows(rows, 'a2'), 'a2', 1)).toBeNull();
  });
});

describe('resolveTagsMove（移到…）', () => {
  it('挂到选定父 Tag 的末尾；顶层为 null', () => {
    expect(resolveTagsMove(forest, 'a1x', null)).toEqual({
      tagId: 'a1x',
      parentChange: null,
      tagOrder: ['a', 'a1', 'a2', 'b', 'a1x'],
    });
    expect(resolveTagsMove(forest, 'b', 'a1')).toMatchObject({ parentChange: 'a1' });
  });

  it('父 Tag 不变或成环时为 null', () => {
    expect(resolveTagsMove(forest, 'a1', 'a')).toBeNull();
    expect(resolveTagsMove(forest, 'a', 'a1x')).toBeNull();
    expect(canNestUnder(forest, 'a', 'a1x')).toBe(false);
    expect(canNestUnder(forest, 'a1x', 'b')).toBe(true);
  });
});
