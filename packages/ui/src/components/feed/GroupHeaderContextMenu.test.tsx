import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaResponseDto, ProjectResponseDto } from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

import { ProjectGroupHeaderRow } from './ProjectGroupHeaderRow';
import { AreaGroupHeaderRow } from './AreaGroupHeaderRow';
import { AreaMoreMenu } from '../area/AreaMoreMenu';

const mutations = vi.hoisted(() => ({
  complete: vi.fn(),
  deleteArea: vi.fn(),
  updateArea: vi.fn(),
}));
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useCompleteProject: () => ({ mutate: mutations.complete }),
  useUncompleteProject: () => ({ mutate: vi.fn() }),
  useDeleteProject: () => ({ mutate: vi.fn() }),
  useRestoreProject: () => ({ mutate: vi.fn() }),
  useUpdateProject: () => ({ mutate: vi.fn() }),
  useSkipProject: () => ({ mutate: vi.fn() }),
  useDeleteArea: () => ({ mutate: mutations.deleteArea }),
  useUpdateArea: () => ({ mutate: mutations.updateArea }),
  useTagsQuery: () => ({
    data: [{ id: 'tag-1', title: 'Important', color: null, parentId: null }],
  }),
  useCreateTag: () => ({ mutate: vi.fn() }),
}));

const area: AreaResponseDto = {
  id: 'area-1',
  title: 'Family',
  notes: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const project: ProjectResponseDto = {
  ...area,
  id: 'project-1',
  title: 'Vacation in Rome',
  areaId: null,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.ANYTIME,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  dueDate: null,
  completedAt: null,
  trashedAt: null,
  taskTotalCount: 3,
  taskCompletedCount: 1,
};

function renderHeader(content: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/anytime']}>
        <Routes>
          <Route path="/anytime" element={content} />
          <Route path="/today" element={<div data-testid="today" />} />
          <Route path="/projects/:id" element={<div data-testid="project-detail" />} />
          <Route path="/areas/:id" element={<div data-testid="area-detail" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Group Header context menus', () => {
  it('opens the real Project menu from the title and completes after confirming remaining tasks', async () => {
    renderHeader(<ProjectGroupHeaderRow project={project} />);
    fireEvent.contextMenu(screen.getByRole('link', { name: project.title }));
    fireEvent.click(await screen.findByRole('button', { name: /^Mark Complete/ }));
    expect(mutations.complete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Mark All as Canceled/ }));
    expect(mutations.complete).toHaveBeenCalledWith(
      { id: project.id, settleRemaining: 'cancelled' },
      expect.anything(),
    );
    expect(screen.queryByTestId('project-detail')).not.toBeInTheDocument();
  });

  it('opens the Area menu and applies tags to the Area, not its tasks', async () => {
    renderHeader(<AreaGroupHeaderRow area={area} />);
    fireEvent.contextMenu(screen.getByRole('link', { name: area.title }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tags' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Important' }));
    expect(mutations.updateArea).toHaveBeenCalledWith(
      { id: area.id, data: { tagIds: ['tag-1'] } },
      expect.anything(),
    );
    expect(screen.queryByTestId('area-detail')).not.toBeInTheDocument();
  });

  it('deletes an Area from its header without forcing a navigation to Today', async () => {
    mutations.deleteArea.mockImplementation((_id, options) => options.onSuccess?.());
    renderHeader(<AreaGroupHeaderRow area={area} />);
    fireEvent.contextMenu(screen.getByRole('heading', { name: area.title }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).toHaveBeenCalledWith(area.id, expect.anything());
    expect(screen.queryByTestId('today')).not.toBeInTheDocument();
  });

  it('preserves the Area detail more-menu entry and its post-delete navigation', async () => {
    mutations.deleteArea.mockImplementation((_id, options) => options.onSuccess?.());
    renderHeader(<AreaMoreMenu area={area} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).toHaveBeenCalledWith(area.id, expect.anything());
    expect(screen.getByTestId('today')).toBeInTheDocument();
  });

  it('keeps the title link and progress checkbox as separate interactive controls', () => {
    renderHeader(<ProjectGroupHeaderRow project={project} />);
    const heading = screen.getByRole('heading', { name: project.title });
    const link = within(heading).getByRole('link');
    expect(link).not.toContainElement(within(heading).getByRole('checkbox'));
  });
});
