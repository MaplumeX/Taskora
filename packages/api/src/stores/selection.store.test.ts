import { beforeEach, describe, expect, it } from 'vitest';

import {
  contextMenuTargets,
  extendSelectionTo,
  flattenSelectionRows,
  reorderedRowIds,
  toggleRowSelection,
  useSelectionStore,
} from './selection.store';

const row = (id: string) => ({ id, kind: 'task' as const, completed: false });

beforeEach(() => {
  useSelectionStore.setState({ scopes: {}, scopeOrder: [], scopeRank: {}, selectedIds: [] });
});

describe('flattenSelectionRows', () => {
  it('按 rank 拼接 scope，同 rank 按注册顺序', () => {
    const { registerScope } = useSelectionStore.getState();
    // 注册顺序与页面顺序不一致：稍后项目、任务先于活跃项目挂载
    registerScope('later', [row('later-1')], 2);
    registerScope('tasks', [row('task-1'), row('task-2')], 1);
    registerScope('active', [row('project-1')], 0);
    registerScope('extra', [row('extra-1')], 0);

    expect(flattenSelectionRows(useSelectionStore.getState()).map((r) => r.id)).toEqual([
      'project-1',
      'extra-1',
      'task-1',
      'task-2',
      'later-1',
    ]);
  });

  it('注销 scope 时一并移除其 rank', () => {
    const { registerScope, unregisterScope } = useSelectionStore.getState();
    registerScope('a', [row('a')], 3);
    unregisterScope('a');
    expect(useSelectionStore.getState().scopeRank).toEqual({});
  });
});

describe('多选：⌘/Ctrl+点击、⇧+点击', () => {
  const heading = (id: string) => ({ id, kind: 'heading' as const });
  const ids = () => useSelectionStore.getState().selectedIds;

  beforeEach(() => {
    useSelectionStore.setState({ anchorId: null });
    useSelectionStore
      .getState()
      .registerScope('list', [row('a'), row('b'), heading('h'), row('c'), row('d')]);
  });

  it('⌘点击切换单行，被点的行成为光标', () => {
    useSelectionStore.getState().setSelection(['a']);
    toggleRowSelection('c');
    expect(ids()).toEqual(['a', 'c']);
    toggleRowSelection('a');
    expect(ids()).toEqual(['c']);
    toggleRowSelection('c');
    expect(ids()).toEqual([]);
  });

  it('⌘点击丢弃原选中的非任务行', () => {
    useSelectionStore.getState().setSelection(['h']);
    toggleRowSelection('c');
    expect(ids()).toEqual(['c']);
  });

  it('⇧点击选中锚点到该行的连续任务行（跳过 Heading），光标排在末项', () => {
    useSelectionStore.getState().setSelection(['a']);
    extendSelectionTo('d');
    expect(ids()).toEqual(['a', 'b', 'c', 'd']);
    // 锚点不变：再往回点收缩范围
    extendSelectionTo('b');
    expect(ids()).toEqual(['a', 'b']);
  });

  it('⇧点击向上扩展时，光标仍是末项', () => {
    useSelectionStore.getState().setSelection(['d']);
    extendSelectionTo('b');
    expect(ids()).toEqual(['d', 'c', 'b']);
    expect(useSelectionStore.getState().anchorId).toBe('d');
  });

  it('以 ⌘点击的行为新锚点', () => {
    useSelectionStore.getState().setSelection(['a']);
    toggleRowSelection('c');
    extendSelectionTo('d');
    expect(ids()).toEqual(['c', 'd']);
  });

  it('没有选中时 ⇧点击退化为单选', () => {
    extendSelectionTo('c');
    expect(ids()).toEqual(['c']);
  });
});

describe('右键菜单作用对象', () => {
  const ids = () => useSelectionStore.getState().selectedIds;

  beforeEach(() => {
    useSelectionStore.getState().registerScope('list', [row('a'), row('b'), row('c')]);
  });

  it('右键多选之中的行：作用于整组，多选不变', () => {
    useSelectionStore.getState().setSelection(['c', 'a']);
    expect(contextMenuTargets('a')).toEqual(['c', 'a']);
    expect(ids()).toEqual(['c', 'a']);
  });

  it('右键多选之外的行：只作用于它，多选改为只选中它', () => {
    useSelectionStore.getState().setSelection(['a', 'b']);
    expect(contextMenuTargets('c')).toEqual(['c']);
    expect(ids()).toEqual(['c']);
  });

  it('单选时右键其它行：只作用于它，不改动选中', () => {
    useSelectionStore.getState().setSelection(['a']);
    expect(contextMenuTargets('b')).toEqual(['b']);
    expect(ids()).toEqual(['a']);
  });
});

describe('reorderedRowIds（⌘↑/⌘↓ 键盘排序）', () => {
  const sorted = (id: string, sortGroup = 'a') => ({ ...row(id), sortGroup });
  it('单行上移 / 下移一步，到顶 / 到底', () => {
    const rows = [sorted('1'), sorted('2'), sorted('3')];
    expect(reorderedRowIds(rows, ['2'], 'up')).toEqual(['2', '1', '3']);
    expect(reorderedRowIds(rows, ['2'], 'down')).toEqual(['1', '3', '2']);
    expect(reorderedRowIds(rows, ['3'], 'top')).toEqual(['3', '1', '2']);
    expect(reorderedRowIds(rows, ['1'], 'bottom')).toEqual(['2', '3', '1']);
  });

  it('已在边界时返回 null', () => {
    const rows = [sorted('1'), sorted('2')];
    expect(reorderedRowIds(rows, ['1'], 'up')).toBeNull();
    expect(reorderedRowIds(rows, ['2'], 'bottom')).toBeNull();
  });

  it('多选作为整块移动（块内间隙合拢）', () => {
    const rows = [sorted('1'), sorted('2'), sorted('3'), sorted('4')];
    expect(reorderedRowIds(rows, ['2', '4'], 'up')).toEqual(['2', '4', '1', '3']);
    expect(reorderedRowIds(rows, ['1', '2'], 'down')).toEqual(['3', '1', '2', '4']);
  });

  it('只在同组内移动，其他行原位不动；跨组或不可排序返回 null', () => {
    const rows = [
      sorted('a1', 'a'),
      { id: 'h', kind: 'heading' as const },
      sorted('b1', 'b'),
      sorted('b2', 'b'),
    ];
    expect(reorderedRowIds(rows, ['b2'], 'top')).toEqual(['a1', 'h', 'b2', 'b1']);
    expect(reorderedRowIds(rows, ['b1'], 'up')).toBeNull();
    expect(reorderedRowIds(rows, ['a1', 'b1'], 'down')).toBeNull();
    expect(reorderedRowIds(rows, ['h'], 'down')).toBeNull();
  });
});
