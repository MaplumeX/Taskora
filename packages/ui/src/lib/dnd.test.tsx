import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import * as React from 'react';

import { applyOrder, useCollapseAfterDragStart, useHeldOrder } from './dnd';

interface Row {
  id: string;
  sortable: boolean;
}

function rowKey(row: Row) {
  return row.id;
}

describe('applyOrder', () => {
  it('fills the sortable slots in the given order and leaves other items in place', () => {
    const items: Row[] = [
      { id: 'a', sortable: true },
      { id: 'p', sortable: false },
      { id: 'b', sortable: true },
      { id: 'c', sortable: true },
    ];
    expect(applyOrder(items, ['c', 'a', 'b'], rowKey).map(rowKey)).toEqual(['c', 'p', 'a', 'b']);
  });

  it('returns the input when no id matches', () => {
    const items: Row[] = [{ id: 'a', sortable: true }];
    expect(applyOrder(items, ['x'], rowKey)).toBe(items);
  });
});

describe('useHeldOrder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  let hold: (ids: string[]) => void = () => undefined;
  function Harness({ rows }: { rows: Row[] }) {
    const [ordered, holdOrder] = useHeldOrder(rows, rowKey);
    hold = holdOrder;
    return <div data-testid="list">{ordered.map(rowKey).join(',')}</div>;
  }

  const rows = (...ids: string[]) => ids.map((id) => ({ id, sortable: true }));

  it('renders the held order until the source catches up', () => {
    const { getByTestId, rerender } = render(<Harness rows={rows('a', 'b', 'c')} />);
    act(() => hold(['c', 'a', 'b']));
    expect(getByTestId('list').textContent).toBe('c,a,b');

    // 同内容的新数组（实时查询重发）不应提前交还。
    rerender(<Harness rows={rows('a', 'b', 'c')} />);
    expect(getByTestId('list').textContent).toBe('c,a,b');

    rerender(<Harness rows={rows('c', 'a', 'b')} />);
    expect(getByTestId('list').textContent).toBe('c,a,b');
    // 追上后再有新的服务端顺序，直接跟随 props。
    rerender(<Harness rows={rows('b', 'c', 'a')} />);
    expect(getByTestId('list').textContent).toBe('b,c,a');
  });

  it('falls back to the source order after a timeout', () => {
    vi.useFakeTimers();
    const { getByTestId } = render(<Harness rows={rows('a', 'b')} />);
    act(() => hold(['b', 'a']));
    expect(getByTestId('list').textContent).toBe('b,a');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getByTestId('list').textContent).toBe('a,b');
  });
});

describe('useCollapseAfterDragStart', () => {
  it('拖拽开始那次提交的 layout effect 里仍是收起前的布局，之后才收起', () => {
    // Probe 模拟 dnd-kit：在拖拽开始那次提交的 layout effect 里测被拖行起点。
    const measured: number[] = [];
    function Probe({ active }: { active: boolean }) {
      React.useLayoutEffect(() => {
        if (active) measured.push(document.querySelectorAll('[data-row]').length);
      }, [active]);
      return null;
    }
    let start = () => {};
    function List() {
      const [drag, setDrag] = React.useState<{ collapsed: boolean } | null>(null);
      start = () => setDrag({ collapsed: false });
      useCollapseAfterDragStart(!!drag && !drag.collapsed, () => setDrag({ collapsed: true }));
      const rows = drag?.collapsed ? ['c'] : ['a', 'b', 'c'];
      return (
        <>
          {rows.map((id) => (
            <div key={id} data-row />
          ))}
          <Probe active={!!drag} />
        </>
      );
    }

    render(<List />);
    act(() => start());

    expect(measured).toEqual([3]);
    expect(document.querySelectorAll('[data-row]')).toHaveLength(1);
  });
});
