import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MobileFab } from './MobileFab';
import { AppDndProvider, useDndSurface } from '../../lib/appDnd';

// useContentBottomActionsForRoute 是 MobileFab 的唯一数据源，mock 掉 hook 而非底层 mutation

const baseActions = {
  showAddTask: true,
  showAddProject: false,
  showAddHeading: false,
  showAddArea: false,
  handleAddTask: vi.fn(),
  handleAddProject: vi.fn(),
  handleAddHeading: vi.fn(),
  handleAddArea: vi.fn(),
  addTaskPending: false,
  addProjectPending: false,
  addHeadingPending: false,
  addAreaPending: false,
};

import { useContentBottomActionsForRoute } from '@taskora/api';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
    useContentBottomActionsForRoute: vi.fn(),
}));
const mockHook = vi.mocked(useContentBottomActionsForRoute);

function AcceptingList() {
  useDndSurface({ owns: () => false, magicPlus: true });
  return null;
}

function renderFab({
  path = '/today',
  scope,
  acceptingList = false,
}: { path?: string; scope?: 'shell' | 'home'; acceptingList?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppDndProvider>
          {acceptingList && <AcceptingList />}
          <MobileFab scope={scope} />
        </AppDndProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MobileFab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no actions are available', () => {
    mockHook.mockReturnValue({ ...baseActions, showAddTask: false } as never);
    const { container } = renderFab();
    expect(container.querySelector('button')).toBeNull();
  });

  it('single action: clicking FAB directly adds a task', async () => {
    mockHook.mockReturnValue(baseActions as never);
    renderFab();
    screen.getByRole('button').click();
    await waitFor(() => expect(baseActions.handleAddTask).toHaveBeenCalled());
  });

  it('multiple actions: opens an upward menu listing all actions', async () => {
    mockHook.mockReturnValue({
      ...baseActions,
      showAddProject: true,
    } as never);
    renderFab();
    await userEvent.click(screen.getByRole('button'));
    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(2);
  });

  it('project page: clicking FAB adds a task directly (heading is not offered)', async () => {
    mockHook.mockReturnValue({ ...baseActions, showAddHeading: true } as never);
    renderFab();
    await userEvent.click(screen.getByRole('button'));
    expect(baseActions.handleAddTask).toHaveBeenCalled();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(baseActions.handleAddHeading).not.toHaveBeenCalled();
  });

  it('is a Magic Plus drag source when a list on the page accepts it, menu or not', () => {
    mockHook.mockReturnValue(baseActions as never);
    renderFab({ acceptingList: true });
    expect(screen.getByRole('button')).toHaveClass('touch-none');
  });

  it('stays a plain button when nothing on the page accepts Magic Plus', () => {
    mockHook.mockReturnValue(baseActions as never);
    renderFab();
    expect(screen.getByRole('button')).not.toHaveClass('touch-none');
  });

  it('a menu page with an accepting list still opens the menu on tap', async () => {
    mockHook.mockReturnValue({ ...baseActions, showAddProject: true } as never);
    renderFab({ acceptingList: true });
    expect(screen.getByRole('button')).toHaveClass('touch-none');
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findAllByRole('menuitem')).toHaveLength(2);
  });

  it('on /home only the home-scoped button renders', () => {
    mockHook.mockReturnValue(baseActions as never);
    const { unmount } = renderFab({ path: '/home' });
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    renderFab({ path: '/home', scope: 'home' });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('home: menu offers new task, project and area', async () => {
    mockHook.mockReturnValue({
      ...baseActions,
      showAddProject: true,
      showAddArea: true,
    } as never);
    renderFab();
    await userEvent.click(screen.getByRole('button'));
    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(3);
    await userEvent.click(screen.getByRole('menuitem', { name: /area|区域/i }));
    expect(baseActions.handleAddArea).toHaveBeenCalled();
  });
});
