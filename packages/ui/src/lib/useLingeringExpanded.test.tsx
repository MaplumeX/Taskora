import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  live: { data: undefined as { trashedAt: string | null } | undefined, isError: false },
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@taskora/api')>()),
  useTaskQuery: () => harness.live,
}));

import { useSelectionStore, useUiInteractionStore } from '@taskora/api';
import { useLingeringExpanded } from './useLingeringExpanded';

interface Row {
  id: string;
  group: string;
}

const idOf = (row: Row) => row.id;
const a = { id: 'a', group: 'inbox' };
const b = { id: 'b', group: 'inbox' };
const c = { id: 'c', group: 'inbox' };

function setup(
  initial: Row[],
  options?: { unlessShownElsewhere?: boolean; stays?: (before: Row, now: Row) => boolean },
) {
  return renderHook(({ items }) => useLingeringExpanded(items, idOf, options), {
    initialProps: { items: initial },
  });
}

beforeEach(() => {
  harness.live = { data: { trashedAt: null }, isError: false };
  useUiInteractionStore.setState({ expandedId: null });
  useSelectionStore.setState({ scopes: {} });
});

describe('useLingeringExpanded', () => {
  it('展开中的任务离开列表后留在原位（保留离开前的样子），收起后才离开', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c]);

    rerender({ items: [a, c] });
    expect(result.current).toEqual([a, b, c]);
    expect(result.current[1]).toBe(b);

    act(() => useUiInteractionStore.setState({ expandedId: null }));
    expect(result.current).toEqual([a, c]);
  });

  it('前一行也不在了时按原下标插回；原本在首行时插回首行', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c]);
    rerender({ items: [c] });
    expect(result.current).toEqual([c, b]);

    act(() => useUiInteractionStore.setState({ expandedId: 'a' }));
    rerender({ items: [a, c] });
    rerender({ items: [c] });
    expect(result.current).toEqual([a, c]);
  });

  it('未展开的任务离开列表时直接离开', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'a' }));
    const { result, rerender } = setup([a, b, c]);
    rerender({ items: [a, c] });
    expect(result.current).toEqual([a, c]);
  });

  it('任务进了 Trash 或已不存在时不暂留', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c]);
    harness.live = { data: { trashedAt: '2026-10-10T00:00:00Z' }, isError: false };
    rerender({ items: [a, c] });
    expect(result.current).toEqual([a, c]);

    harness.live = { data: undefined, isError: true };
    rerender({ items: [c, a] });
    expect(result.current).toEqual([c, a]);
  });

  it('unlessShownElsewhere：任务已出现在同页另一个列表时不暂留', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c], { unlessShownElsewhere: true });
    act(() =>
      useSelectionStore.setState({
        scopes: { other: [{ id: 'b', kind: 'task' } as never] },
      }),
    );
    rerender({ items: [a, c] });
    expect(result.current).toEqual([a, c]);
  });
});

describe('useLingeringExpanded — stays', () => {
  const sameGroup = (before: Row, now: Row) => before.group === now.group;

  it('仍在列表里但换了分组时留在原分组原位，收起后才跟随数据', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c], { stays: sameGroup });

    const moved = { id: 'b', group: 'later' };
    rerender({ items: [a, c, moved] });
    expect(result.current).toEqual([a, b, c]);

    act(() => useUiInteractionStore.setState({ expandedId: null }));
    expect(result.current).toEqual([a, c, moved]);
  });

  it('同一分组内的变化（如排序）照常跟随', () => {
    act(() => useUiInteractionStore.setState({ expandedId: 'b' }));
    const { result, rerender } = setup([a, b, c], { stays: sameGroup });
    rerender({ items: [b, a, c] });
    expect(result.current).toEqual([b, a, c]);
  });
});
