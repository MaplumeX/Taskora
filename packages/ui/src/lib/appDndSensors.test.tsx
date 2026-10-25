import * as React from 'react';
import { createPortal } from 'react-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useDraggable } from '@dnd-kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppDndProvider, useDndSurface } from './appDnd';

const onDragStart = vi.fn();

function Row() {
  useDndSurface({ owns: (id) => id === 'task:1', onDragStart });
  const { listeners, setNodeRef } = useDraggable({ id: 'task:1' });
  return (
    <div ref={setNodeRef} data-testid="row" {...listeners}>
      {/* 行内菜单打开的面板：DOM 在 body 下，React 树上仍是行的子孙。 */}
      {createPortal(<div data-testid="panel" />, document.body)}
    </div>
  );
}

function renderRow() {
  render(
    <AppDndProvider onSidebarDrop={vi.fn()}>
      <Row />
    </AppDndProvider>,
  );
}

function mouseDrag(target: HTMLElement) {
  fireEvent.mouseDown(target, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseMove(document, { clientX: 10, clientY: 40 });
  fireEvent.mouseUp(document, { clientX: 10, clientY: 40 });
}

function touchHold(target: HTMLElement) {
  fireEvent.touchStart(target, { touches: [{ clientX: 10, clientY: 10 }] });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  fireEvent.touchEnd(document);
}

afterEach(() => {
  onDragStart.mockReset();
  vi.useRealTimers();
});

describe('AppDndProvider — row sensors', () => {
  it('a mouse drag on the row starts dragging it', () => {
    renderRow();
    mouseDrag(screen.getByTestId('row'));
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('a mouse drag inside a portaled panel does not drag the row', () => {
    renderRow();
    mouseDrag(screen.getByTestId('panel'));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('a long press on the row starts dragging it', () => {
    vi.useFakeTimers();
    renderRow();
    touchHold(screen.getByTestId('row'));
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('a long press inside a portaled panel does not drag the row', () => {
    vi.useFakeTimers();
    renderRow();
    touchHold(screen.getByTestId('panel'));
    expect(onDragStart).not.toHaveBeenCalled();
  });
});
