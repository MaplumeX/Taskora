import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import * as React from 'react';

import { useMultiSelectStore, useSelectionStore } from '@taskora/api';

import {
  applyOrder,
  dragGroupOf,
  dragSelectionIds,
  flipId,
  useCollapseAfterDragStart,
  useFlipList,
  useHeldOrder,
} from './dnd';

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

describe('dragSelectionIds', () => {
  afterEach(() => {
    useMultiSelectStore.getState().exit();
    useSelectionStore.getState().clearSelection();
  });

  it('uses the keyboard Selection outside Multi-Select Mode', () => {
    useSelectionStore.getState().setSelection(['a', 'b']);
    expect(dragSelectionIds()).toEqual(['a', 'b']);
  });

  it('uses the checked tasks in Multi-Select Mode, so a long-press drags them together', () => {
    useSelectionStore.getState().setSelection(['x']);
    useMultiSelectStore.getState().enter('c');
    useMultiSelectStore.getState().toggle('a');
    expect(dragGroupOf('a', ['a', 'b', 'c'], dragSelectionIds())).toEqual(['a', 'c']);
    // 拖勾选之外的行仍是单项拖拽
    expect(dragGroupOf('b', ['a', 'b', 'c'], dragSelectionIds())).toBeNull();
  });
});

describe('useFlipList（数据驱动的位移 / 进场 / 离场）', () => {
  const ROW_HEIGHT = 30;
  let calls: { element: Element; keyframes: Keyframe[]; animation: Animation }[] = [];

  beforeEach(() => {
    calls = [];
    // jsdom 没有布局与 WAAPI：行按 DOM 顺序每行 30px 高排布。
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rows = Array.from(document.querySelectorAll('[data-flip-id]'));
      const index = rows.indexOf(this);
      const top = index < 0 ? 0 : index * ROW_HEIGHT;
      return new DOMRect(0, top, 200, index < 0 ? rows.length * ROW_HEIGHT : ROW_HEIGHT);
    });
    Element.prototype.animate = function (this: Element, keyframes: Keyframe[]) {
      const animation = { cancel: vi.fn(), onfinish: null, oncancel: null } as unknown as Animation;
      calls.push({ element: this, keyframes, animation });
      return animation;
    } as Element['animate'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as Partial<Element>).animate;
  });

  function List({ ids }: { ids: string[] }) {
    const flip = useFlipList<HTMLDivElement>(ids);
    return (
      <div ref={flip.rootRef} data-testid="root">
        {ids.map((id) => (
          <div key={id} {...flipId(id)} data-row={id}>
            {id}
          </div>
        ))}
      </div>
    );
  }

  const callsOn = (selector: string) =>
    calls.filter(({ element }) => element.matches(selector));

  it('删除：原位置留一份收起淡出的残影，下方行上移', () => {
    const { rerender, getByTestId } = render(<List ids={['a', 'b', 'c']} />);
    rerender(<List ids={['a', 'c']} />);

    const ghost = getByTestId('root').lastElementChild as HTMLElement;
    expect(ghost.textContent).toBe('b');
    expect(ghost.hasAttribute('data-flip-id')).toBe(false);
    expect(ghost.hasAttribute('data-row')).toBe(false);
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(ghost.style.top).toBe('30px');
    const ghostCall = calls.find(({ element }) => element === ghost)!;
    expect(ghostCall.keyframes).toEqual([
      { height: '30px', opacity: 1 },
      { height: '0px', opacity: 0 },
    ]);
    expect(callsOn('[data-row="c"]')[0].keyframes[0]).toEqual({
      transform: 'translate(0px, 30px)',
    });

    act(() => ghostCall.animation.onfinish?.(new Event('finish') as AnimationPlaybackEvent));
    expect(ghost.isConnected).toBe(false);
  });

  it('新建：新行自上而下揭开，下方行下移', () => {
    const { rerender } = render(<List ids={['a', 'c']} />);
    rerender(<List ids={['a', 'b', 'c']} />);

    expect(callsOn('[data-row="b"]')[0].keyframes[0]).toEqual({
      clipPath: 'inset(0 0 100% 0)',
      opacity: 0,
    });
    expect(callsOn('[data-row="c"]')[0].keyframes[0]).toEqual({
      transform: 'translate(0px, -30px)',
    });
  });

  it('换了分组 / 顺序：只做位移，没有进出场', () => {
    const { rerender, getByTestId } = render(<List ids={['a', 'b', 'c']} />);
    rerender(<List ids={['b', 'c', 'a']} />);

    expect(callsOn('[data-row="a"]')[0].keyframes[0]).toEqual({
      transform: 'translate(0px, -60px)',
    });
    expect(calls.every(({ keyframes }) => 'transform' in keyframes[0])).toBe(true);
    expect(getByTestId('root').children).toHaveLength(3);
  });

  it('同一位置换了 id（临时 id → 服务端 id）不算进出场', () => {
    const { rerender, getByTestId } = render(<List ids={['a', 'temp']} />);
    rerender(<List ids={['a', 'real']} />);

    expect(calls).toHaveLength(0);
    expect(getByTestId('root').children).toHaveLength(2);
  });

  it('前后没有共同行（首次加载、换了项目）不播放', () => {
    const { rerender } = render(<List ids={[]} />);
    rerender(<List ids={['a', 'b']} />);
    rerender(<List ids={['x', 'y']} />);

    expect(calls).toHaveLength(0);
  });
});
