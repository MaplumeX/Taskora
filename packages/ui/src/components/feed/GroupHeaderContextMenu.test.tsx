import { fireEvent, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
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
  deleteAreaPending: false,
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
  useDeleteArea: () => ({ mutate: mutations.deleteArea, isPending: mutations.deleteAreaPending }),
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

beforeEach(() => {
  vi.resetAllMocks();
  mutations.deleteAreaPending = false;
});

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

  it('confirms deletion of an Area from its header without forcing a navigation to Today', async () => {
    mutations.deleteArea.mockImplementation((_id, options) => options.onSuccess?.());
    renderHeader(<AreaGroupHeaderRow area={area} />);
    fireEvent.contextMenu(screen.getByRole('heading', { name: area.title }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Delete area "Family"?' });
    expect(dialog).toHaveAccessibleDescription(
      'This permanently deletes the area and cannot be undone. Its projects and tasks will be moved to the Trash.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).toHaveBeenCalledTimes(1);
    expect(mutations.deleteArea).toHaveBeenCalledWith(area.id, expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today')).not.toBeInTheDocument();
    expect(screen.queryByTestId('area-detail')).not.toBeInTheDocument();
  });

  it('preserves the Area detail more-menu entry and its post-delete navigation', async () => {
    mutations.deleteArea.mockImplementation((_id, options) => options.onSuccess?.());
    renderHeader(<AreaMoreMenu area={area} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).not.toHaveBeenCalled();
    expect(screen.queryByTestId('today')).not.toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'Delete area "Family"?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).toHaveBeenCalledTimes(1);
    expect(mutations.deleteArea).toHaveBeenCalledWith(area.id, expect.anything());
    expect(screen.getByTestId('today')).toBeInTheDocument();
  });

  it.each(['detail', 'header'] as const)(
    'does not delete from the Area %s when confirmation is canceled',
    async (entry) => {
      renderHeader(entry === 'detail' ? <AreaMoreMenu area={area} /> : <AreaGroupHeaderRow area={area} />);
      const openMenu = () => {
        if (entry === 'detail') fireEvent.click(screen.getByRole('button', { name: 'More' }));
        else fireEvent.contextMenu(screen.getByRole('heading', { name: area.title }));
      };
      openMenu();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mutations.deleteArea).not.toHaveBeenCalled();
      expect(screen.queryByTestId('today')).not.toBeInTheDocument();

      // Reopening the action must ask for confirmation again.
      openMenu();
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(mutations.deleteArea).not.toHaveBeenCalled();
    },
  );

  it.each(['Escape', 'Close'])(
    'does not delete when the confirmation is dismissed with %s',
    async (dismiss) => {
      renderHeader(<AreaMoreMenu area={area} />);
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('dialog');
      if (dismiss === 'Escape') fireEvent.keyDown(dialog, { key: 'Escape' });
      else fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mutations.deleteArea).not.toHaveBeenCalled();
      expect(screen.queryByTestId('today')).not.toBeInTheDocument();
    },
  );

  it('disables the destructive confirmation while an Area deletion is pending', async () => {
    mutations.deleteAreaPending = true;
    renderHeader(<AreaMoreMenu area={area} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mutations.deleteArea).not.toHaveBeenCalled();
  });

  it('reports a failed Area deletion without navigating and allows a retry', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockImplementation(() => 'error-toast');
    mutations.deleteArea.mockImplementationOnce((_id, options) => options.onError?.());
    renderHeader(<AreaMoreMenu area={area} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(errorToast).toHaveBeenCalledWith('Failed to delete');
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByTestId('today')).not.toBeInTheDocument();

    mutations.deleteArea.mockImplementationOnce((_id, options) => options.onSuccess?.());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(mutations.deleteArea).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('today')).toBeInTheDocument();
    errorToast.mockRestore();
  });

  it('keeps the title link and progress checkbox as separate interactive controls', () => {
    renderHeader(<ProjectGroupHeaderRow project={project} />);
    const heading = screen.getByRole('heading', { name: project.title });
    const link = within(heading).getByRole('link');
    expect(link).not.toContainElement(within(heading).getByRole('checkbox'));
  });
});
