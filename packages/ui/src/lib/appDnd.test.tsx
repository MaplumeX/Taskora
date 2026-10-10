import * as React from 'react';
import { act, render } from '@testing-library/react';
import type { CollisionDetection } from '@dnd-kit/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface DndHandlers {
  collisionDetection: CollisionDetection;
  onDragStart: (event: unknown) => void;
  onDragOver: (event: unknown) => void;
  onDragEnd: (event: unknown) => void;
  onDragCancel: () => void;
}

const harness = vi.hoisted(() => ({
  dnd: null as DndHandlers | null,
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const ReactModule = await import('react');
  return {
    ...(await importOriginal<typeof import('@dnd-kit/core')>()),
    DndContext: (props: DndHandlers & { children: React.ReactNode }) => {
      // React 生成组件栈（如 act 警告）时会无参调用祖先组件，忽略那次调用。
      if (props) harness.dnd = props;
      return ReactModule.createElement(ReactModule.Fragment, null, props?.children);
    },
  };
});

import {
  AppDndProvider,
  useDndSurface,
  useSidebarDropArea,
  type DndSurface,
} from './appDnd';

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function container(id: string, box: DOMRect | null = null) {
  const node = box ? ({ getBoundingClientRect: () => box } as unknown as HTMLElement) : null;
  return { id, node: { current: node }, disabled: false, data: { current: {} } };
}

const SIDEBAR = rect(0, 0, 200, 800);

function Sidebar() {
  const { setAreaRef } = useSidebarDropArea();
  const ref = React.useCallback(
    (node: HTMLElement | null) => {
      if (node) node.getBoundingClientRect = () => SIDEBAR;
      setAreaRef(node);
    },
    [setAreaRef],
  );
  return <aside ref={ref} />;
}

function Surface({ surface }: { surface: DndSurface }) {
  useDndSurface(surface);
  return null;
}

function renderApp(surfaces: DndSurface[], onSidebarDrop = vi.fn()) {
  render(
    <AppDndProvider onSidebarDrop={onSidebarDrop}>
      <Sidebar />
      {surfaces.map((surface, index) => (
        <Surface key={index} surface={surface} />
      ))}
    </AppDndProvider>,
  );
  return onSidebarDrop;
}

function dnd() {
  if (!harness.dnd) throw new Error('DndContext was not rendered');
  return harness.dnd;
}

function collide(activeId: string, pointer: { x: number; y: number }, containers: unknown[]) {
  return dnd().collisionDetection({
    active: { id: activeId },
    pointerCoordinates: pointer,
    droppableContainers: containers,
    droppableRects: new Map(),
    collisionRect: rect(pointer.x, pointer.y, 10, 10),
  } as never);
}

function taskSurface(overrides: Partial<DndSurface> = {}): DndSurface {
  return {
    owns: (id) => id.startsWith('task:'),
    collisionDetection: ({ droppableContainers }) =>
      droppableContainers.map(({ id }) => ({ id })),
    sidebarPayload: (id) => ({
      kind: 'tasks',
      tasks: [
        {
          id: id.slice('task:'.length),
          projectId: null,
          areaId: null,
          bucket: 'ANYTIME',
          scheduledType: 'NONE' as never,
          scheduledDate: null,
          status: 'ACTIVE',
        },
      ],
    }),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
    onDragCancel: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  harness.dnd = null;
});

describe('AppDndProvider — collision routing', () => {
  const listRow = container('task:t2', rect(300, 100, 400, 30));
  const inbox = container('sidebar-drop:inbox', rect(0, 100, 200, 28));
  const area = container('sidebar-drop:area:a1', rect(0, 200, 200, 28));

  it('outside the sidebar only the source list’s own droppables are considered', () => {
    renderApp([taskSurface()]);
    const otherList = container('header:x', rect(300, 140, 400, 30));
    expect(collide('task:t1', { x: 400, y: 110 }, [listRow, inbox, otherList])).toEqual([
      { id: 'task:t2' },
    ]);
  });

  it('inside the sidebar the hovered accepting row wins over the list', () => {
    renderApp([taskSurface()]);
    expect(collide('task:t1', { x: 50, y: 110 }, [listRow, inbox, area])).toEqual([
      { id: 'sidebar-drop:inbox' },
    ]);
  });

  it('inside the sidebar off any accepting row, over is the sidebar itself', () => {
    renderApp([taskSurface()]);
    expect(collide('task:t1', { x: 50, y: 400 }, [listRow, inbox, area])).toEqual([
      { id: 'sidebar-drop:region' },
    ]);
  });

  it('rows that do not accept the payload are not hit (project over Inbox)', () => {
    renderApp([
      taskSurface({
        owns: (id) => id.startsWith('project:'),
        sidebarPayload: (id) => ({
          kind: 'project',
          project: {
            id: id.slice('project:'.length),
            areaId: null,
            status: 'ACTIVE',
            scheduledType: 'NONE' as never,
            scheduledDate: null,
          },
        }),
      }),
    ]);
    expect(collide('project:p1', { x: 50, y: 110 }, [inbox, area])).toEqual([
      { id: 'sidebar-drop:region' },
    ]);
    expect(collide('project:p1', { x: 50, y: 210 }, [inbox, area])).toEqual([
      { id: 'sidebar-drop:area:a1' },
    ]);
  });

  it('a surface without a sidebar payload keeps its own collisions inside the sidebar', () => {
    const sidebarSort = container('proj:p1', rect(0, 300, 200, 28));
    renderApp([
      taskSurface({ owns: (id) => id.startsWith('proj:'), sidebarPayload: undefined }),
    ]);
    expect(collide('proj:p2', { x: 50, y: 310 }, [sidebarSort, inbox])).toEqual([
      { id: 'proj:p1' },
    ]);
  });

  it('touch drags never reach the sidebar', () => {
    renderApp([taskSurface()]);
    act(() =>
      dnd().onDragStart({ active: { id: 'task:t1' }, activatorEvent: new TouchEvent('touchstart') }),
    );
    const listRow2 = container('task:t3', rect(0, 100, 200, 28));
    expect(collide('task:t1', { x: 50, y: 110 }, [inbox, listRow2])).toEqual([{ id: 'task:t3' }]);
  });

  it('drags no surface owns collide with nothing', () => {
    renderApp([taskSurface()]);
    expect(collide('other:1', { x: 400, y: 110 }, [listRow])).toEqual([]);
  });
});

describe('AppDndProvider — event routing', () => {
  it('routes events only to the surface that owns the dragged item', () => {
    const tasks = taskSurface();
    const projects = taskSurface({ owns: (id) => id.startsWith('proj:') });
    renderApp([tasks, projects]);

    act(() => dnd().onDragStart({ active: { id: 'proj:p1' } }));
    act(() => dnd().onDragEnd({ active: { id: 'proj:p1' }, over: { id: 'proj:p2' } }));

    expect(projects.onDragStart).toHaveBeenCalledTimes(1);
    expect(projects.onDragEnd).toHaveBeenCalledTimes(1);
    expect(tasks.onDragStart).not.toHaveBeenCalled();
    expect(tasks.onDragEnd).not.toHaveBeenCalled();
  });

  it('a drop on a sidebar row cancels the list drag and hands the payload over', () => {
    const tasks = taskSurface();
    const onSidebarDrop = renderApp([tasks]);

    act(() => dnd().onDragStart({ active: { id: 'task:t1' } }));
    const row = document.createElement('a');
    act(() =>
      dnd().onDragEnd({
        active: { id: 'task:t1' },
        over: { id: 'sidebar-drop:project:p1', data: { current: { anchor: { current: row } } } },
      }),
    );

    expect(tasks.onDragEnd).not.toHaveBeenCalled();
    expect(tasks.onDragCancel).toHaveBeenCalledTimes(1);
    expect(onSidebarDrop).toHaveBeenCalledWith(
      { kind: 'tasks', tasks: [expect.objectContaining({ id: 't1' })] },
      { kind: 'project', projectId: 'p1' },
      row,
    );
  });

  it('a drop on the sidebar off any row only cancels', () => {
    const tasks = taskSurface();
    const onSidebarDrop = renderApp([tasks]);

    act(() => dnd().onDragStart({ active: { id: 'task:t1' } }));
    act(() => dnd().onDragEnd({ active: { id: 'task:t1' }, over: { id: 'sidebar-drop:region' } }));

    expect(tasks.onDragCancel).toHaveBeenCalledTimes(1);
    expect(onSidebarDrop).not.toHaveBeenCalled();
  });

  it('switches to the sidebar auto-scroll while over the sidebar', () => {
    renderApp([taskSurface()]);
    act(() => dnd().onDragStart({ active: { id: 'task:t1' } }));
    expect((harness.dnd as unknown as { autoScroll: unknown }).autoScroll).toBe(true);

    act(() => dnd().onDragOver({ active: { id: 'task:t1' }, over: { id: 'sidebar-drop:today' } }));
    expect((harness.dnd as unknown as { autoScroll: unknown }).autoScroll).toMatchObject({
      threshold: { y: 0.06 },
    });
  });
});

describe('AppDndProvider — Magic Plus', () => {
  it('goes to the surface that accepts Magic Plus, not to row owners', () => {
    const rows = taskSurface();
    const list = taskSurface({ owns: (id) => id.startsWith('feed:'), magicPlus: true });
    renderApp([rows, list]);

    act(() => dnd().onDragStart({ active: { id: 'magic-plus' } }));
    act(() =>
      dnd().onDragEnd({ active: { id: 'magic-plus' }, over: { id: 'feed:t1' }, delta: { x: -50, y: -300 } }),
    );

    expect(list.onDragStart).toHaveBeenCalledTimes(1);
    expect(list.onDragEnd).toHaveBeenCalledTimes(1);
    expect(rows.onDragStart).not.toHaveBeenCalled();
  });

  it('never offers the sidebar to Magic Plus', () => {
    renderApp([taskSurface({ magicPlus: true })]);
    act(() => dnd().onDragStart({ active: { id: 'magic-plus' } }));
    const inbox = container('sidebar-drop:inbox', rect(0, 100, 200, 28));
    expect(collide('magic-plus', { x: 50, y: 110 }, [inbox])).toEqual([]);
  });

  it('released back near the button cancels instead of dropping', () => {
    const list = taskSurface({ magicPlus: true });
    renderApp([list]);

    act(() => dnd().onDragStart({ active: { id: 'magic-plus' } }));
    act(() =>
      dnd().onDragEnd({ active: { id: 'magic-plus' }, over: { id: 'task:t1' }, delta: { x: 10, y: -20 } }),
    );

    expect(list.onDragCancel).toHaveBeenCalledTimes(1);
    expect(list.onDragEnd).not.toHaveBeenCalled();
  });

  it('does nothing when no list on the page accepts it', () => {
    const rows = taskSurface();
    renderApp([rows]);
    act(() => dnd().onDragStart({ active: { id: 'magic-plus' } }));
    act(() =>
      dnd().onDragEnd({ active: { id: 'magic-plus' }, over: null, delta: { x: -50, y: -300 } }),
    );
    expect(rows.onDragStart).not.toHaveBeenCalled();
    expect(rows.onDragEnd).not.toHaveBeenCalled();
  });
});

describe('AppDndProvider — Magic Plus Inbox target', () => {
  const inboxTarget = container('magic-plus-inbox', rect(300, 700, 56, 56));
  const row = container('task:t1', rect(250, 600, 400, 40));

  it('the Inbox target wins while the pointer is on it, only for Magic Plus', () => {
    renderApp([taskSurface({ magicPlus: true })]);
    expect(collide('magic-plus', { x: 320, y: 720 }, [row, inboxTarget])).toEqual([
      { id: 'magic-plus-inbox' },
    ]);
    expect(collide('magic-plus', { x: 320, y: 620 }, [row, inboxTarget])).toEqual([{ id: 'task:t1' }]);
    expect(collide('task:t1', { x: 320, y: 720 }, [row, inboxTarget])).toEqual([{ id: 'task:t1' }]);
  });

  it('dropping on it resets the list and hands over to the target', () => {
    const list = taskSurface({ magicPlus: true });
    const onDrop = vi.fn();
    renderApp([list]);
    act(() => dnd().onDragStart({ active: { id: 'magic-plus' } }));
    act(() =>
      dnd().onDragEnd({
        active: { id: 'magic-plus' },
        over: { id: 'magic-plus-inbox', data: { current: { onDrop } } },
        delta: { x: -300, y: 0 },
      }),
    );
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(list.onDragCancel).toHaveBeenCalledTimes(1);
    expect(list.onDragEnd).not.toHaveBeenCalled();
  });
});
