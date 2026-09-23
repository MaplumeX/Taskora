import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SortableTask 键盘拖拽冲突回归测试（真实 @dnd-kit，不 mock sensors）：
 *
 * dnd-kit KeyboardSensor 默认把 Enter/Space 当作「开始拖拽」的启动键，
 * 而 SortableTask 把 {...listeners} 铺在整行外层。当焦点落在任务行
 * （roving tabindex 的 [data-selection-row]）上按 Enter 时，事件冒泡到
 * 外层 div 的 onKeyDown 会同时启动键盘拖拽（isDragging 半透明 +
 * placeholder 蓝线、handleDragStart 还会清空 selection/expanded），
 * 与全局键位（Enter=展开，ADR-0004）叠加后表现为「展开的行像被拖住、
 * 卡在拖拽态」。此测试保证行内 Enter/Space 不再启动键盘拖拽。
 */

const harness = vi.hoisted(() => ({
  completeMutate: vi.fn(),
  uncompleteMutate: vi.fn(),
  saveLayoutMutate: vi.fn(),
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
    useReorderProjectHeadingLayout: () => ({ mutate: harness.saveLayoutMutate }),
    // useTaskRowSelection 依赖真实 store；uiInteraction/selection store 同样真实。
    useTaskRowSelection: actual.useTaskRowSelection,
  };
});

vi.mock('@/components/task/TaskItem', async () => {
  const ReactModule = await import('react');
  return {
    TaskItem: ({
      task,
      selectionState = 'idle',
      onRowClick,
    }: {
      task: TaskResponseDto;
      selectionState?: string;
      onRowClick?: () => void;
    }) =>
      ReactModule.createElement(
        'div',
        {
          'data-task-item': '',
          'data-selection-row': task.id,
          'data-selection-state': selectionState,
          role: 'button',
          tabIndex: 0,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            onRowClick?.();
          },
        },
        task.title,
      ),
  };
});

import { ProjectTaskLayout } from './ProjectTaskLayout';
import { useSelectionStore, useUiInteractionStore } from '@taskora/api';

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  sortOrder: 0,
  status: HeadingStatus.ACTIVE,
  completedAt: null,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

function task(id: string): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: 'project-1',
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

describe('SortableTask — keyboard drag conflict regression', () => {
  beforeEach(() => {
    harness.completeMutate.mockReset();
    harness.uncompleteMutate.mockReset();
    harness.saveLayoutMutate.mockReset();
    useSelectionStore.getState().clearSelection();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  function renderLayout() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <ProjectTaskLayout
          projectId="project-1"
          tasks={[task('task-1'), task('task-2')]}
          headings={[heading]}
          emptyHint="Empty"
        />
      </QueryClientProvider>,
    );
  }

  /** 选中并聚焦任务行（复现 roving tabindex 下按 Enter 展开的路径）。 */
  function selectAndFocusRow(id: string) {
    const row = document.querySelector<HTMLElement>(`[data-selection-row="${id}"]`);
    if (!row) throw new Error(`Row ${id} was not rendered`);
    fireEvent.click(row);
    row.focus();
    return row;
  }

  it('does not start a keyboard drag when Enter is pressed on the focused row', async () => {
    renderLayout();
    const row = selectAndFocusRow('task-1');

    await act(async () => {
      fireEvent.keyDown(row, { key: 'Enter', code: 'Enter', bubbles: true });
    });

    // 键盘拖拽未启动：无 placeholder、无拖拽半透明样式、无 layout 变更落盘。
    expect(screen.queryByTestId('task-placeholder-task-1')).not.toBeInTheDocument();
    const sortableRow = row.closest('[data-sortable-task-id]') as HTMLElement | null;
    expect(sortableRow).not.toBeNull();
    expect(sortableRow!.style.opacity).not.toBe('0.45');
    expect(harness.saveLayoutMutate).not.toHaveBeenCalled();
  });

  it('does not start a keyboard drag when Space is pressed on the focused row', async () => {
    renderLayout();
    const row = selectAndFocusRow('task-1');

    await act(async () => {
      fireEvent.keyDown(row, { key: ' ', code: 'Space', bubbles: true });
    });

    expect(screen.queryByTestId('task-placeholder-task-1')).not.toBeInTheDocument();
    const sortableRow = row.closest('[data-sortable-task-id]') as HTMLElement | null;
    expect(sortableRow).not.toBeNull();
    expect(sortableRow!.style.opacity).not.toBe('0.45');
    expect(harness.saveLayoutMutate).not.toHaveBeenCalled();
  });

  it('still expands the row through the shared click cycle after Enter does not drag', () => {
    renderLayout();
    const row = selectAndFocusRow('task-1');

    // 点击循环：selected → expanded（与 Enter 展开共享 uiInteraction store）。
    fireEvent.click(row);
    expect(useUiInteractionStore.getState().expandedId).toBe('task-1');

    // 展开态下行内 Enter 不应启动键盘拖拽，展开态保持稳定。
    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter', bubbles: true });
    expect(screen.queryByTestId('task-placeholder-task-1')).not.toBeInTheDocument();
    waitFor(() => {
      const sortableRow = row.closest('[data-sortable-task-id]') as HTMLElement | null;
      expect(sortableRow?.style.opacity ?? '').not.toBe('0.45');
    });
  });
});
