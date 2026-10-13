import { beforeEach, describe, expect, it } from 'vitest';

import {
  sidebarContextMenuTargets,
  sidebarSelectionGroup,
  useSidebarSelectionStore,
} from './sidebarSelection.store';

beforeEach(() => {
  useSidebarSelectionStore.setState({ ids: [], anchorId: null, order: ['a', 'b', 'c', 'd'] });
});

describe('useSidebarSelectionStore', () => {
  it('首次 toggle 把当前打开的项目一并选中', () => {
    useSidebarSelectionStore.getState().toggle('c', 'a');
    expect(useSidebarSelectionStore.getState().ids).toEqual(['a', 'c']);
  });

  it('toggle 已选中的行即取消', () => {
    const { toggle } = useSidebarSelectionStore.getState();
    toggle('c', 'a');
    toggle('a', 'a');
    expect(useSidebarSelectionStore.getState().ids).toEqual(['c']);
  });

  it('当前不是项目页时 toggle 只选中该行', () => {
    useSidebarSelectionStore.getState().toggle('b', null);
    expect(useSidebarSelectionStore.getState().ids).toEqual(['b']);
  });

  it('extendTo 以当前项目为锚点选中连续范围', () => {
    useSidebarSelectionStore.getState().extendTo('c', 'a');
    expect(useSidebarSelectionStore.getState().ids).toEqual(['a', 'b', 'c']);
  });

  it('extendTo 以最近一次 toggle 的行为锚点，向上也可', () => {
    const { toggle, extendTo } = useSidebarSelectionStore.getState();
    toggle('d', null);
    extendTo('b', null);
    expect(sidebarSelectionGroup()).toEqual(['b', 'c', 'd']);
  });

  it('整组按显示顺序，少于 2 个不算多选', () => {
    const { toggle } = useSidebarSelectionStore.getState();
    toggle('c', null);
    expect(sidebarSelectionGroup()).toBeNull();
    toggle('a', null);
    expect(sidebarSelectionGroup()).toEqual(['a', 'c']);
  });

  it('右键多选中的行作用于整组，右键其外的行清空多选', () => {
    useSidebarSelectionStore.getState().toggle('c', 'a');
    expect(sidebarContextMenuTargets('c')).toEqual(['a', 'c']);
    expect(sidebarContextMenuTargets('b')).toEqual(['b']);
    expect(useSidebarSelectionStore.getState().ids).toEqual([]);
  });
});
