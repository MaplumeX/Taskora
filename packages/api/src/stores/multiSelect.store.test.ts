import { beforeEach, describe, expect, it } from 'vitest';

import { useMultiSelectStore } from './multiSelect.store';

beforeEach(() => {
  useMultiSelectStore.setState({ active: false, ids: [] });
});

describe('useMultiSelectStore', () => {
  it('enter 进入模式并以该任务为首个勾选项', () => {
    useMultiSelectStore.getState().enter('a');
    expect(useMultiSelectStore.getState()).toMatchObject({ active: true, ids: ['a'] });
  });

  it('模式中再次 enter 切换该项（左滑已勾选的行 = 取消勾选）', () => {
    const { enter } = useMultiSelectStore.getState();
    enter('a');
    enter('b');
    expect(useMultiSelectStore.getState().ids).toEqual(['a', 'b']);
    enter('a');
    expect(useMultiSelectStore.getState().ids).toEqual(['b']);
  });

  it('勾选集合清空后模式仍保持，exit 才退出', () => {
    const { enter, toggle, exit } = useMultiSelectStore.getState();
    enter('a');
    toggle('a');
    expect(useMultiSelectStore.getState()).toMatchObject({ active: true, ids: [] });
    exit();
    expect(useMultiSelectStore.getState()).toMatchObject({ active: false, ids: [] });
  });
});
