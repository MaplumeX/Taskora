import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MobileFab } from './MobileFab';

// useContentBottomActionsForRoute 是 MobileFab 的唯一数据源，mock 掉 hook 而非底层 mutation

const baseActions = {
  showAddTask: true,
  showAddProject: false,
  showAddHeading: false,
  handleAddTask: vi.fn(),
  handleAddProject: vi.fn(),
  handleAddHeading: vi.fn(),
  addTaskPending: false,
  addProjectPending: false,
  addHeadingPending: false,
};

import { useContentBottomActionsForRoute } from '@taskora/api';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
    useContentBottomActionsForRoute: vi.fn(),
}));
const mockHook = vi.mocked(useContentBottomActionsForRoute);

function renderFab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/today']}>
        <MobileFab />
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
});
