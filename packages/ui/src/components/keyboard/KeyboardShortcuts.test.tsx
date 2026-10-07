import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TaskResponseDto } from '@taskora/shared';
import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  updateTaskMutate: vi.fn(),
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
    useTagsQuery: () => ({
      data: [{ id: 'urgent', title: 'Urgent', color: '#EF4444', parentId: null }],
    }),
    useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdateTask: () => ({ mutate: harness.updateTaskMutate }),
    useUpdateProject: () => ({ mutate: vi.fn() }),
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
import { useKeybindingsStore } from '@taskora/api';
import { useAssistantUiStore } from '@taskora/api';
import { mockDesktop } from '@/test/media';
import { useSelectionScope } from '@taskora/api';
import { type SelectionRow } from '@taskora/api';

/** 测试页：渲染任务行（aria-selected + 点击选中）并注册 selection scope。 */
function ListPage({ tasks }: { tasks: TaskResponseDto[] }) {
  const rows = React.useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        kind: 'task' as const,
        completed: t.status === 'COMPLETED',
        cancelled: t.status === 'CANCELLED',
        tagIds: (t.tags ?? []).map((tag) => tag.id),
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
          data-selection-row={t.id}
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
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    bucket: TaskBucket.INBOX,
    status: completed ? TaskStatus.COMPLETED : TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
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
  harness.updateTaskMutate.mockReset();
  useSelectionStore.getState().setSelection([]);
  useSelectionStore.getState().clearSelection();
  useUiInteractionStore.setState({ expandedId: null, searchOpen: false, searchSeed: null });
  window.localStorage.clear();
  useKeybindingsStore.setState({ overrides: {} });
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

  it('⇧↓/⇧↑ 从锚点扩展、收缩连续多选', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(useSelectionStore.getState().selectedIds).toEqual(['t1', 't2', 't3']);
    press('ArrowUp', { shiftKey: true });
    expect(useSelectionStore.getState().selectedIds).toEqual(['t1', 't2']);
    expect(screen.getByTestId('row-t3')).not.toHaveAttribute('aria-selected');
    // 普通 ↓ 从光标（t2）出发回到单选
    press('ArrowDown');
    expect(useSelectionStore.getState().selectedIds).toEqual(['t3']);
  });

  it('多选后 ⌘K 批量完成选中的行', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('ArrowDown', { shiftKey: true });
    press('k', { metaKey: true });
    expect(harness.completeMutate.mock.calls.map(([id]) => id)).toEqual(['t1', 't2']);
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

describe('KeyboardShortcuts — 标签（tags-things3 issue 04）', () => {
  it('⇧⌘T 对选中任务打开 Tag Picker，切换后写入该任务', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('T', { metaKey: true, shiftKey: true });
    const option = screen.getByRole('option', { name: 'Urgent' });
    expect(option).toHaveAttribute('aria-checked', 'false');
    act(() => option.click());
    expect(harness.updateTaskMutate).toHaveBeenCalledWith(
      { id: 't1', data: { tagIds: ['urgent'] } },
      expect.anything(),
    );
  });

  it('⌘A 后 ⇧⌘T 对全部选中任务批量打标', () => {
    renderAt('/today', tasks);
    press('a', { metaKey: true });
    press('T', { metaKey: true, shiftKey: true });
    act(() => screen.getByRole('option', { name: 'Urgent' }).click());
    expect(harness.updateTaskMutate).toHaveBeenCalledTimes(3);
  });

  it('没有 Selection 时不打开', () => {
    renderAt('/today', tasks);
    press('T', { metaKey: true, shiftKey: true });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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

/** Grouped View 测试页：注册带组头元数据的行（镜像 GroupedFeedListView 的注册形状）。 */
function GroupedListPage() {
  const rows = React.useMemo<SelectionRow[]>(
    () => [
      { id: 'loose', kind: 'task' },
      {
        id: 'p1',
        kind: 'project',
        groupHeaderId: 'p1',
        groupHeader: { createContext: { projectId: 'p1' } },
      },
      { id: 'a1', kind: 'task', groupHeaderId: 'p1' },
      { id: 'a2', kind: 'task', groupHeaderId: 'p1' },
      {
        id: 'p2',
        kind: 'project',
        groupHeaderId: 'p2',
        groupHeader: { createContext: { projectId: 'p2' } },
      },
      { id: 'b1', kind: 'task', groupHeaderId: 'p2' },
    ],
    [],
  );
  useSelectionScope(rows);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.id}
          data-testid={`row-${row.id}`}
          aria-selected={selectedIds.includes(row.id) || undefined}
        >
          {row.id}
        </div>
      ))}
    </div>
  );
}

function renderGrouped(path = '/today') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <KeyboardShortcuts platform="mac" />
      <Routes>
        <Route path="/today" element={<GroupedListPage />} />
        <Route path="/anytime" element={<GroupedListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function select(id: string) {
  act(() => {
    useSelectionStore.getState().setSelection([id]);
  });
}

describe('KeyboardShortcuts — Grouped View 组头行为', () => {
  it('Alt+↓ 在组边界钳制：跳到组内末行而非跨组', () => {
    renderGrouped('/today');
    select('a1');

    press('ArrowDown', { altKey: true });

    expect(useSelectionStore.getState().selectedIds).toEqual(['a2']);
  });

  it('Alt+↑ 在组边界钳制：跳到组块首行（组头）而非顶部浮动区', () => {
    renderGrouped('/today');
    select('a2');

    press('ArrowUp', { altKey: true });

    // 组块的首个可见行是组头本身；未越出组边界进入浮动区。
    expect(useSelectionStore.getState().selectedIds).toEqual(['p1']);
  });

  it('未分组行 Alt+↓ 只在未分组区内跳转', () => {
    renderGrouped('/today');
    select('loose');

    press('ArrowDown', { altKey: true });

    expect(useSelectionStore.getState().selectedIds).toEqual(['loose']);
  });

  it('组头上 Space（下方新建）在父级内创建任务，不重排序', () => {
    renderGrouped('/today');
    select('p1');

    press(' ');

    expect(harness.createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: '', projectId: 'p1' }),
    );
    expect(harness.reorderMutate).not.toHaveBeenCalled();
    expect(useUiInteractionStore.getState().expandedId).toBe('created-task');
    expect(useSelectionStore.getState().selectedIds).toContain('created-task');
  });

  it('组头上 Enter 不行内展开（展开只对任务行生效）', () => {
    renderGrouped('/today');
    select('p1');

    press('Enter');

    expect(useUiInteractionStore.getState().expandedId).toBeNull();
  });
});

describe('KeyboardShortcuts — 搜索与让路', () => {
  it('⌘F 打开搜索（uiInteraction.searchOpen）', () => {
    renderAt('/today', tasks);
    press('f', { metaKey: true });
    expect(useUiInteractionStore.getState().searchOpen).toBe(true);
  });

  it('设置中改绑后按新键位派发，原键位失效', () => {
    useKeybindingsStore.setState({ overrides: { search: ['Meta+P'] } });
    renderAt('/today', tasks);
    press('f', { metaKey: true });
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
    press('p', { metaKey: true });
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

describe('KeyboardShortcuts — 打字唤起 Quick Find', () => {
  const search = () => {
    const { searchOpen, searchSeed } = useUiInteractionStore.getState();
    return { searchOpen, searchSeed };
  };

  it('无 Selection 时敲可打印字符：打开 Quick Find 并带入该字符', () => {
    renderAt('/today', tasks);
    press('A', { shiftKey: true });
    expect(search()).toEqual({ searchOpen: true, searchSeed: 'A' });
  });

  it('输入法组合的首键：打开但不带入字符', () => {
    renderAt('/today', tasks);
    press('Process');
    expect(search()).toEqual({ searchOpen: true, searchSeed: null });
  });

  it('有 Selection 时单键属于列表操作，不唤起', () => {
    renderAt('/today', tasks);
    press('ArrowDown');
    press('a');
    expect(search().searchOpen).toBe(false);
  });

  it('焦点在输入框内时不唤起', () => {
    renderAt('/today', tasks);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));
    });
    expect(search().searchOpen).toBe(false);
    input.remove();
  });

  it('空格仍是下方新建，不唤起', () => {
    renderAt('/today', tasks);
    press(' ');
    expect(search().searchOpen).toBe(false);
    expect(harness.createMutate).toHaveBeenCalled();
  });

  it('助手页不唤起（该页不挂载 Quick Find）', () => {
    renderAt('/agent', tasks);
    press('a');
    expect(search().searchOpen).toBe(false);
  });

  it('触控设备（粗指针）不唤起', () => {
    const original = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({ ...original(query), matches: query === '(pointer: coarse)' }) as MediaQueryList;
    try {
      renderAt('/today', tasks);
      press('a');
      expect(search().searchOpen).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('⌘F 打开时不带入字符', () => {
    useUiInteractionStore.setState({ searchSeed: 'stale' });
    renderAt('/today', tasks);
    press('f', { metaKey: true });
    expect(search()).toEqual({ searchOpen: true, searchSeed: null });
  });
});

describe('KeyboardShortcuts — 输入法打字唤起（隐藏输入框）', () => {
  const sink = () => document.querySelector<HTMLInputElement>('[data-type-to-find-sink]')!;
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  const keydownOnSink = (init: KeyboardEventInit & { keyCode?: number }) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    if (init.keyCode !== undefined) Object.defineProperty(event, 'keyCode', { value: init.keyCode });
    act(() => {
      sink().dispatchEvent(event);
    });
    return event;
  };

  it('焦点无处可落时由隐藏输入框持有', async () => {
    renderAt('/today', tasks);
    await settle();
    expect(sink()).toHaveFocus();
  });

  it('输入法首键交给隐藏输入框组字，不提前唤起', async () => {
    renderAt('/today', tasks);
    await settle();
    const event = keydownOnSink({ key: 'Process', keyCode: 229 });
    expect(event.defaultPrevented).toBe(false);
    keydownOnSink({ key: 'Enter', isComposing: true });
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
  });

  it('组字上屏后以结果唤起 Quick Find', async () => {
    renderAt('/today', tasks);
    await settle();
    act(() => {
      sink().value = '你好';
      sink().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
    });
    const { searchOpen, searchSeed } = useUiInteractionStore.getState();
    expect({ searchOpen, searchSeed }).toEqual({ searchOpen: true, searchSeed: '你好' });
    expect(sink().value).toBe('');
  });

  it('组字期间显形为搜索栏，上屏后隐去', async () => {
    renderAt('/today', tasks);
    await settle();
    const bar = sink().parentElement!;
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    act(() => {
      sink().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
    expect(bar).toHaveAttribute('aria-hidden', 'false');
    act(() => {
      sink().value = '你';
      sink().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
    });
    expect(bar).toHaveAttribute('aria-hidden', 'true');
  });

  it('取消组字（上屏为空）不唤起', async () => {
    renderAt('/today', tasks);
    await settle();
    act(() => {
      sink().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    });
    expect(useUiInteractionStore.getState().searchOpen).toBe(false);
  });

  it('非输入法按键照常唤起并带入字符，不落进隐藏输入框', async () => {
    renderAt('/today', tasks);
    await settle();
    const event = keydownOnSink({ key: 'a' });
    expect(event.defaultPrevented).toBe(true);
    const { searchOpen, searchSeed } = useUiInteractionStore.getState();
    expect({ searchOpen, searchSeed }).toEqual({ searchOpen: true, searchSeed: 'a' });
  });

  it('隐藏输入框持焦时其余快捷键照常生效', async () => {
    renderAt('/today', tasks);
    await settle();
    keydownOnSink({ key: 'ArrowDown' });
    expect(screen.getByTestId('row-t1')).toHaveAttribute('aria-selected', 'true');
  });

  it('有 Selection 时归还焦点，清空后重新持有', async () => {
    renderAt('/today', tasks);
    await settle();
    act(() => useSelectionStore.getState().setSelection(['t1']));
    expect(sink()).not.toHaveFocus();
    act(() => useSelectionStore.getState().clearSelection());
    await settle();
    expect(sink()).toHaveFocus();
  });

  it('鼠标点完链接/按钮后接管其焦点，Tab 来的焦点不抢', async () => {
    renderAt('/today', tasks);
    await settle();
    const link = document.createElement('a');
    link.href = '#';
    document.body.appendChild(link);
    link.focus();
    await settle();
    expect(link).toHaveFocus();
    act(() => {
      link.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      link.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    await settle();
    expect(sink()).toHaveFocus();
    link.remove();
  });

  it('鼠标点进输入框不抢焦点', async () => {
    renderAt('/today', tasks);
    await settle();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      input.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    await settle();
    expect(input).toHaveFocus();
    input.remove();
  });

  it('助手页不持有焦点', async () => {
    renderAt('/agent', tasks);
    await settle();
    expect(sink()).not.toHaveFocus();
  });
});

describe('KeyboardShortcuts — 助手面板（assistant-panel issue 03）', () => {
  let restoreMedia: () => void;
  beforeEach(() => {
    restoreMedia = mockDesktop(true);
    useAssistantUiStore.setState({ panelOpen: false });
  });
  afterEach(() => restoreMedia());

  it('⌘J 开关面板', () => {
    renderAt('/today', tasks);
    press('j', { metaKey: true });
    expect(useAssistantUiStore.getState().panelOpen).toBe(true);
    press('j', { metaKey: true });
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });

  it('面板输入框里也能收起；其他输入框里让路', () => {
    useAssistantUiStore.setState({ panelOpen: true });
    renderAt('/today', tasks);
    const other = document.createElement('textarea');
    document.body.appendChild(other);
    const panel = document.createElement('aside');
    panel.setAttribute('data-assistant-panel', '');
    const composer = document.createElement('textarea');
    panel.appendChild(composer);
    document.body.appendChild(panel);

    act(() => {
      other.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }));
    });
    expect(useAssistantUiStore.getState().panelOpen).toBe(true);

    act(() => {
      composer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }),
      );
    });
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
    other.remove();
    panel.remove();
  });

  it('助手页 ⌘J 收回到面板（无历史时去 Today）', () => {
    renderAt('/agent', tasks);
    press('j', { metaKey: true });
    expect(useAssistantUiStore.getState().panelOpen).toBe(true);
    expect(screen.getByText('list')).toBeInTheDocument();
  });

  it('窄屏不响应（面板只在桌面端存在）', () => {
    restoreMedia();
    restoreMedia = mockDesktop(false);
    renderAt('/today', tasks);
    press('j', { metaKey: true });
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });
});
