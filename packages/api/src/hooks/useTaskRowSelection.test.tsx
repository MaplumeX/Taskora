import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useSelectionStore } from '@/stores/selection.store';
import { useUiInteractionStore } from '@/stores/uiInteraction.store';
import { useTaskRowSelection } from './useTaskRowSelection';

function Harness() {
  useTaskRowSelection();
  return (
    <div>
      <div data-task-item>task</div>
      <div data-testid="blank">blank</div>
    </div>
  );
}

function pointer(
  type: 'pointerdown' | 'pointerup' | 'pointercancel',
  target: Element,
  init: { pointerType: string; x?: number; y?: number; id?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  Object.assign(event, { pointerType: init.pointerType, pointerId: init.id ?? 1 });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('useTaskRowSelection 行外点击收起', () => {
  beforeEach(() => {
    useUiInteractionStore.getState().setExpandedId('t1');
    useSelectionStore.getState().setSelection(['t1']);
  });
  afterEach(() => {
    useUiInteractionStore.getState().setExpandedId(null);
    useSelectionStore.getState().clearSelection();
  });

  it('鼠标按下行外立即收起', () => {
    const { getByTestId } = render(<Harness />);
    pointer('pointerdown', getByTestId('blank'), { pointerType: 'mouse' });
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });

  it('触控轻点行外：抬起时才收起', () => {
    const { getByTestId } = render(<Harness />);
    const blank = getByTestId('blank');
    pointer('pointerdown', blank, { pointerType: 'touch', x: 50, y: 300 });
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
    pointer('pointerup', blank, { pointerType: 'touch', x: 52, y: 302 });
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });

  it('触控滑动滚动列表不收起', () => {
    const { getByTestId } = render(<Harness />);
    const blank = getByTestId('blank');
    pointer('pointerdown', blank, { pointerType: 'touch', x: 50, y: 300 });
    pointer('pointerup', blank, { pointerType: 'touch', x: 50, y: 200 });
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
  });

  it('浏览器接管滚动（pointercancel）不收起', () => {
    const { getByTestId } = render(<Harness />);
    const blank = getByTestId('blank');
    pointer('pointerdown', blank, { pointerType: 'touch', x: 50, y: 300 });
    pointer('pointercancel', blank, { pointerType: 'touch' });
    pointer('pointerup', blank, { pointerType: 'touch', x: 50, y: 300 });
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
  });
});
