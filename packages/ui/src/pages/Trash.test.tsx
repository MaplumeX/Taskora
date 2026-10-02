import { act, render, screen } from '@testing-library/react';
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
}));

const NOW = '2026-09-01T00:00:00.000Z';

function trashedTask(id: string): TaskFeedItem {
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

describe('Trash — Reveal Task', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  beforeEach(() => {
    useSelectionStore.setState({ selectedIds: [] });
    useUiInteractionStore.setState({ revealId: null, expandedId: null });
  });

  it('定位的任务行被选中并滚入视野，请求一次性消费', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    useUiInteractionStore.setState({ revealId: 't2' });
    renderTrash([trashedTask('t1'), trashedTask('t2')]);
    await nextFrame();

    expect(useSelectionStore.getState().selectedIds).toEqual(['t2']);
    expect(useUiInteractionStore.getState().revealId).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    const selected = screen.getByText('t2').closest('[data-task-item]');
    expect(selected).toHaveAttribute('aria-selected', 'true');
  });

  it('没有定位请求时不改动 Selection', async () => {
    renderTrash([trashedTask('t1')]);
    await nextFrame();
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
  });
});
