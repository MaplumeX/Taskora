import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeedQuery, useSelectionStore, useUiInteractionStore } from '@taskora/api';
import {
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type FeedItem,
  type TaskFeedItem,
} from '@taskora/shared';

import Trash from './Trash';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeedQuery: vi.fn(),
  useTaskQuery: () => ({ data: null }),
  useRestoreTask: () => ({ mutate: restoreMock, isPending: false }),
}));

const restoreMock = vi.hoisted(() => vi.fn());

const NOW = '2026-09-01T00:00:00.000Z';

function trashedTask(id: string, overrides: Partial<TaskFeedItem> = {}): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.INBOX,
    completedAt: null,
    trashedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
    projectId: null,
    headingId: null,
    areaId: null,
    ...overrides,
  } as TaskFeedItem;
}

function renderTrash(items: FeedItem[]) {
  vi.mocked(useFeedQuery).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
  } as never);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/trash']}>
        <Trash />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function nextFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

describe('Trash — 普通行（对齐 Things 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSelectionStore.setState({ selectedIds: [] });
    useUiInteractionStore.setState({ revealId: null, expandedId: null });
  });

  it('按真实状态呈现：已完成任务的复选框为勾选、可操作', () => {
    renderTrash([
      trashedTask('done', { status: TaskStatus.COMPLETED, completedAt: NOW }),
      trashedTask('open'),
    ]);
    const done = screen.getByText('done').closest('[data-task-item]')!;
    const open = screen.getByText('open').closest('[data-task-item]')!;
    expect(done.querySelector('[role="checkbox"]')).toHaveAttribute('aria-checked', 'true');
    expect(open.querySelector('[role="checkbox"]')).toHaveAttribute('aria-checked', 'false');
    expect(open.querySelector('[role="checkbox"]')).not.toBeDisabled();
    expect(screen.getByText('open')).not.toHaveClass('line-through');
  });

  it('右键菜单：末项为「放回」，无「转为项目」', () => {
    renderTrash([trashedTask('t1')]);
    fireEvent.contextMenu(screen.getByText('t1'));
    expect(screen.queryByText('Convert to Project')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Put Back'));
    expect(restoreMock).toHaveBeenCalledWith('t1', expect.anything());
  });
});

describe('Trash — Reveal Task', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: [] });
    useUiInteractionStore.setState({ revealId: null, expandedId: null });
  });

  it('定位的任务行与其他视图一样展开并滚入视野，请求一次性消费', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    useUiInteractionStore.setState({ revealId: 't2', expandedId: 't2' });
    renderTrash([trashedTask('t1'), trashedTask('t2')]);
    await nextFrame();

    expect(useUiInteractionStore.getState().revealId).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const expanded = screen.getByDisplayValue('t2').closest('[data-task-item]');
    expect(expanded).toHaveAttribute('aria-selected', 'true');
  });

  it('没有定位请求时不改动 Selection', async () => {
    renderTrash([trashedTask('t1')]);
    await nextFrame();
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });
});
