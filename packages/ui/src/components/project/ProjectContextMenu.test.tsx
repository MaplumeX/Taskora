import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { ProjectResponseDto } from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

import { ProjectContextMenu } from './ProjectContextMenu';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useUpdateProject: () => ({ mutate: updateMock, isPending: false }),
  useCompleteProject: () => ({ mutate: completeMock, isPending: false }),
  useUncompleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreProject: () => ({ mutate: vi.fn(), isPending: false }),
  useSkipProject: () => ({ mutate: skipMock, isPending: false }),
}));

const updateMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const skipMock = vi.hoisted(() => vi.fn());

const baseProject: ProjectResponseDto = {
  id: 'project-1',
  title: 'Weekly review',
  notes: null,
  areaId: null,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.ANYTIME,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  dueDate: null,
  repeatRule: null,
  repeatSourceId: null,
  completedAt: null,
  trashedAt: null,
  tags: [],
  taskTotalCount: 0,
  taskCompletedCount: 0,
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
};

function renderMenu(project: ProjectResponseDto) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectContextMenu project={project} current={project}>
          <span>{project.title}</span>
        </ProjectContextMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.contextMenu(screen.getByText(project.title));
}

describe('ProjectContextMenu — 重复项目（recurring-projects）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无计划日期的项目不提供「重复」与「跳过本次」', async () => {
    renderMenu(baseProject);
    await screen.findByRole('button', { name: /^(Mark Complete|标记完成)/ });
    expect(screen.queryByRole('button', { name: /^(Repeat|重复)$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip Occurrence|跳过本次/ })).toBeNull();
  });

  it('DATE 项目提供「重复」；带规则时提供「跳过本次」', async () => {
    renderMenu({
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
      bucket: ProjectBucket.SCHEDULED,
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    expect(await screen.findByRole('button', { name: /^(Repeat|重复)$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip Occurrence|跳过本次/ }));
    expect(skipMock).toHaveBeenCalledWith('project-1', expect.anything());
  });

  it('完成仍有未了结任务的项目：先询问，选择后带 settleRemaining 完成', async () => {
    renderMenu({ ...baseProject, taskTotalCount: 3, taskCompletedCount: 1 });
    fireEvent.click(await screen.findByRole('button', { name: /^(Mark Complete|标记完成)/ }));
    expect(completeMock).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: /Mark All as Completed|全部标记为完成/ }),
    );
    expect(completeMock).toHaveBeenCalledWith(
      { id: 'project-1', settleRemaining: 'completed' },
      expect.anything(),
    );
  });
});
