import { beforeEach, describe, expect, it } from 'vitest';

import { flattenSelectionRows, useSelectionStore } from './selection.store';

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
