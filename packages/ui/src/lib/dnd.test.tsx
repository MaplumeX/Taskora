import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import * as React from 'react';

import { applyOrder, useHeldOrder } from './dnd';

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
