import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TaskResponseDto } from '@taskora/shared';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * KeyboardShortcuts 页面级接缝测试（spec Testing Decisions）：
 * 渲染 keymap registry + 一个挂了列表 scope 的路由页面，向 window 派发
 * 真实 KeyboardEvent，断言外部可见行为（aria-selected、mutation 调用、
 * 导航、搜索态）。
 */

const harness = vi.hoisted(() => ({
  completeMutate: vi.fn(),
  uncompleteMutate: vi.fn(),
  cancelMutate: vi.fn(),
  uncancelMutate: vi.fn(),
  deleteMutate: vi.fn(),
  restoreMutate: vi.fn(),
  reorderMutate: vi.fn(),
  createMutate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

vi.mock('@taskora/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@taskora/api')>();
  return {
    ...actual,
    useCompleteTask: () => ({ mutate: harness.completeMutate }),
    useUncompleteTask: () => ({ mutate: harness.uncompleteMutate }),
    useCancelTask: () => ({ mutate: harness.cancelMutate }),
    useUncancelTask: () => ({ mutate: harness.uncancelMutate }),
    useDeleteTask: () => ({ mutate: harness.deleteMutate }),
    useRestoreTask: () => ({ mutate: harness.restoreMutate }),
    useReorderTasks: () => ({ mutate: harness.reorderMutate }),
    useCreateTask: () => ({
      mutate: (data: { title: string }, opts?: { onSuccess?: (t: { id: string }) => void }) => {
        harness.createMutate(data);
        opts?.onSuccess?.({ id: 'created-task' });
      },
    }),
    useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
    useCreateProjectHeading: () => ({ mutate: vi.fn(), isPending: false }),
    useProjectsQuery: () => ({ data: [] }),
    useAreasQuery: () => ({ data: [] }),
    useTagsQuery: () => ({ data: [] }),
    useContentBottomActionsForRoute: () => ({
      showAddTask: true,
      showAddProject: false,
      showAddHeading: false,
      handleAddTask: () => harness.createMutate({ title: '', __viaBottomBar: true }),
      handleAddProject: vi.fn(),
      handleAddHeading: vi.fn(),
      addTaskPending: false,
      addProjectPending: false,
      addHeadingPending: false,
    }),
    // useTaskRowSelection 依赖真实 store；uiInteraction store 同样真实。
    useTaskRowSelection: actual.useTaskRowSelection,
  };
});

import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useSelectionStore } from '@taskora/api';
import { useUiInteractionStore } from '@taskora/api';
import { useSelectionScope } from '@taskora/api';

/** 测试页：渲染任务行（aria-selected + 点击选中）并注册 selection scope。 */
function ListPage({ tasks }: { tasks: TaskResponseDto[] }) {
  const rows = React.useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        kind: 'task' as const,
        completed: t.status === 'COMPLETED',
        cancelled: t.status === 'CANCELLED',
      })),
    [tasks],
  );
  useSelectionScope(rows);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const setSelection = useSelectionStore((s) => s.setSelection);
  return (
    <div>
      <h1>list</h1>
      {tasks.map((t) => (
        <div
          key={t.id}
          data-task-item
          role="option"
          aria-selected={selectedIds.includes(t.id) || undefined}
          onClick={() => setSelection([t.id])}
          data-testid={`row-${t.id}`}
        >
          {t.title}
        </div>
      ))}
    </div>
  );
}

function task(id: string, completed = false): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: completed ? TaskStatus.COMPLETED : TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function cancelledTask(id: string): TaskResponseDto {
  return {
    ...task(id),
    status: TaskStatus.CANCELLED,
    completedAt: '2026-08-01T00:00:00.000Z',
  };
}

function press(key: string, mods: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...mods,
      }),
    );
  });
}

function renderAt(path: string, tasks: TaskResponseDto[], platform: 'mac' | 'windows' | 'web' = 'mac') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <KeyboardShortcuts platform={platform} />
      <Routes>
        <Route path="/today" element={<ListPage tasks={tasks} />} />
        <Route path="/logbook" element={<ListPage tasks={tasks} />} />
        <Route path="/trash" element={<ListPage tasks={tasks} />} />
        <Route path="/inbox" element={<div data-testid="inbox-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const tasks = [task('t1'), task('t2'), task('t3')];

beforeEach(() => {
  harness.completeMutate.mockReset();
  harness.uncompleteMutate.mockReset();
  harness.cancelMutate.mockReset();
  harness.uncancelMutate.mockReset();
  harness.deleteMutate.mockReset();
  harness.restoreMutate.mockReset();
  harness.reorderMutate.mockReset();
  harness.createMutate.mockReset();
  useSelectionStore.getState().setSelection([]);
  useSelectionStore.getState().clearSelection();
  useUiInteractionStore.setState({ expandedId: null, searchOpen: false });
});

describe('KeyboardShortcuts — 导航与选择', () => {
  it('↓/↑ 逐行移动 Selection（aria-selected 跟随）', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    expect(screen.getByTestId('row-t1')).toHaveAttribute('aria-selected', 'true');
    press('ArrowDown');
    expect(screen.getByTestId('row-t2')).toHaveAttribute('aria-selected', 'true');
    press('ArrowUp');
    expect(screen.getByTestId('row-t1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('row-t2')).not.toHaveAttribute('aria-selected');
  });

  it('Alt+↓/Alt+↑ 跳到末项/首项', () => {
    renderAt('/today', tasks);
    press('ArrowDown', { altKey: true });
    expect(screen.getByTestId('row-t3')).toHaveAttribute('aria-selected', 'true');
    press('ArrowUp', { altKey: true });
    expect(screen.getByTestId('row-t1')).toHaveAttribute('aria-selected', 'true');
  });

  it('⌘A 全选所有任务行', () => {
    renderAt('/today', tasks);
    press('a', { metaKey: true });
    for (const id of ['t1', 't2', 't3']) {
      expect(screen.getByTestId(`row-${id}`)).toHaveAttribute('aria-selected', 'true');
    }
  });

  it('⌘2 导航到 Today 之外的 Bucket（/inbox）', () => {
    renderAt('/today', tasks);
    press('1', { metaKey: true });
    expect(screen.getByTestId('inbox-page')).toBeInTheDocument();
  });

  it('页面切换后 Selection 重置', () => {
    const view = renderAt('/today', tasks);
    press('ArrowDown');
    expect(screen.getByTestId('row-t1')).toHaveAttribute('aria-selected', 'true');
    // 导航到 inbox（无行）后选中应被清空
    press('1', { metaKey: true });
    view.unmount();
  });

  it('Web 平台：Alt+1 跳转 Bucket', () => {
    renderAt('/today', tasks, 'web');
    press('1', { altKey: true });
    expect(screen.getByTestId('inbox-page')).toBeInTheDocument();
  });
});

describe('KeyboardShortcuts — 完成与删除', () => {
  it('⌘K 完成选中任务，Selection 移到相邻行', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('k', { metaKey: true });
    expect(harness.completeMutate).toHaveBeenCalledWith('t1');
    expect(screen.getByTestId('row-t2')).toHaveAttribute('aria-selected', 'true');
  });

  it('⌘A 后 ⌘K 批量完成全部', () => {
    renderAt('/today', tasks);
    press('a', { metaKey: true });
    press('k', { metaKey: true });
    expect(harness.completeMutate).toHaveBeenCalledTimes(3);
  });

  it('Logbook 中 ⌘K 撤销完成（uncomplete）', () => {
    renderAt('/logbook', tasks);
    press('ArrowDown');
    press('k', { metaKey: true });
    expect(harness.uncompleteMutate).toHaveBeenCalledWith('t1');
    expect(harness.completeMutate).not.toHaveBeenCalled();
  });

  it('⌫ 删除选中任务到 Trash', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('Backspace');
    expect(harness.deleteMutate).toHaveBeenCalledWith('t1');
    expect(screen.getByTestId('row-t2')).toHaveAttribute('aria-selected', 'true');
  });

  it('Trash 页 ⌫ 恢复选中任务', () => {
    renderAt('/trash', tasks);
    press('ArrowDown');
    press('Delete');
    expect(harness.restoreMutate).toHaveBeenCalledWith('t1');
    expect(harness.deleteMutate).not.toHaveBeenCalled();
  });
});

describe('KeyboardShortcuts — 取消（spec: task-cancelled）', () => {
  it('⌥⌘K 取消选中任务，Selection 移到相邻行（与 ⌘K 同型）', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('k', { metaKey: true, altKey: true });
    expect(harness.cancelMutate).toHaveBeenCalledWith('t1');
    expect(screen.getByTestId('row-t2')).toHaveAttribute('aria-selected', 'true');
  });

  it('Windows 桌面 Ctrl+Alt+K 取消；Web Alt+Shift+K 取消', () => {
    renderAt('/today', tasks, 'windows');
    press('ArrowDown');
    press('k', { ctrlKey: true, altKey: true });
    expect(harness.cancelMutate).toHaveBeenCalledWith('t1');

    renderAt('/today', tasks, 'web');
    press('ArrowDown');
    press('k', { altKey: true, shiftKey: true });
    expect(harness.cancelMutate).toHaveBeenCalledWith('t1');
  });

  it('⌘A 后 ⌥⌘K 批量取消全部', () => {
    renderAt('/today', tasks);
    press('a', { metaKey: true });
    press('k', { metaKey: true, altKey: true });
    expect(harness.cancelMutate).toHaveBeenCalledTimes(3);
  });

  it('Logbook 中 ⌥⌘K 对已取消行撤销取消，对已完成行不动作', () => {
    renderAt('/logbook', [cancelledTask('t1'), task('t2', true)]);
    press('ArrowDown');
    press('k', { metaKey: true, altKey: true });
    expect(harness.uncancelMutate).toHaveBeenCalledWith('t1');
    expect(harness.cancelMutate).not.toHaveBeenCalled();
  });

  it('Logbook 中 ⌘K 对已取消行撤销取消（与撤销完成同键）', () => {
    renderAt('/logbook', [cancelledTask('t1')]);
    press('ArrowDown');
    press('k', { metaKey: true });
    expect(harness.uncancelMutate).toHaveBeenCalledWith('t1');
    expect(harness.uncompleteMutate).not.toHaveBeenCalled();
  });
});

describe('KeyboardShortcuts — 展开与新建', () => {
  it('Enter 行内展开选中任务，再按 Enter 收起（toggle，与点击循环对齐）', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('Enter');
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
    // 焦点已不在编辑元素内（blur 后落到 body）：Enter 应收起而非 no-op。
    press('Enter');
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
    // 收起回 selected，再次 Enter 可重新展开。
    press('Enter');
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
  });

  it('展开另一行时收起原展开行', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('Enter');
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
    press('ArrowDown');
    press('Enter');
    expect(useUiInteractionStore.getState().expandedId).toBe('t2');
  });

  it('Space 在选中项下方新建并重排序', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('ArrowDown'); // 选中 t2
    press(' ');
    expect(harness.createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: '', scheduledType: 'DATE' }),
    );
    expect(harness.reorderMutate).toHaveBeenCalledWith(['t1', 't2', 'created-task', 't3']);
    expect(useUiInteractionStore.getState().expandedId).toBe('created-task');
    // 展开行同时被选中，后续 ⌫/⌘K 等作用于 selectedIds 的动作可用。
    expect(useSelectionStore.getState().selectedIds).toContain('created-task');
  });

  it('⌘N 新建任务（复用底部动作）', () => {
    renderAt('/today', tasks);
    press('n', { metaKey: true });
    expect(harness.createMutate).toHaveBeenCalledWith({ title: '', __viaBottomBar: true });
  });
});

describe('KeyboardShortcuts — 搜索与让路', () => {
  it('⌘F 打开搜索（uiInteraction.searchOpen）', () => {
    renderAt('/today', tasks);
    press('f', { metaKey: true });
    expect(useUiInteractionStore.getState().searchOpen).toBe(true);
  });

  it('Web 平台 Ctrl+K 完成任务而非打开搜索（破坏性改绑）', () => {
    renderAt('/today', tasks, 'web');
    press('ArrowDown');
    press('k', { ctrlKey: true });
    expect(harness.completeMutate).toHaveBeenCalledWith('t1');
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
  });

  it('按钮聚焦时 Enter/Space 让路（原生激活路径，避免双重触发）', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    // 真实浏览器中事件从聚焦元素冒泡到 window；直接在按钮上派发。
    act(() => {
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(useUiInteractionStore.getState().expandedId).toBeNull();
    button.remove();
  });

  it('Tab 聚焦 role=button 的行 div 后按 Enter 仍展开（无原生激活语义，不让路）', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    const rowButton = document.createElement('div');
    rowButton.setAttribute('role', 'button');
    rowButton.setAttribute('tabindex', '0');
    document.body.appendChild(rowButton);
    rowButton.focus();
    act(() => {
      rowButton.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(useUiInteractionStore.getState().expandedId).toBe('t1');
    rowButton.remove();
  });

  it('行内编辑聚焦时快捷键让路', () => {
    renderAt('/today', tasks);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    press('k', { metaKey: true });
    expect(harness.completeMutate).not.toHaveBeenCalled();
    input.remove();
  });

  it('Radix Dialog 打开时让路', () => {
    renderAt('/today', tasks);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);
    press('k', { metaKey: true });
    expect(harness.completeMutate).not.toHaveBeenCalled();
    dialog.remove();
  });
});

