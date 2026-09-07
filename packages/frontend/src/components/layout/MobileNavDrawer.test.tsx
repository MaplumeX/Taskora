import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileNavDrawer } from './MobileNavDrawer';
import { useAuthStore } from '@/lib/stores/auth.store';

vi.mock('@/lib/hooks/useProjects', () => ({
  useProjectsQuery: () => ({ data: [] }),
  useCreateProject: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderProjects: () => ({ mutate: vi.fn() }),
  useUpdateProject: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/lib/hooks/useAreas', () => ({
  useAreasQuery: () => ({ data: [] }),
  useReorderAreas: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/lib/hooks/useTags', () => ({
  useTagsQuery: () => ({ data: [] }),
}));
vi.mock('@/lib/hooks/useProjectHeadings', () => ({
  useCreateProjectHeading: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/hooks/useAuth', () => ({
  useLogout: () => vi.fn(),
}));

function setup(open: boolean) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/today']}>
        <MobileNavDrawer open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('MobileNavDrawer', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('renders drawer entries when open', () => {
    setup(true);

    expect(screen.getByRole('link', { name: 'Upcoming' })).toHaveAttribute(
      'href',
      '/upcoming',
    );
    expect(screen.getByRole('link', { name: 'Someday' })).toHaveAttribute(
      'href',
      '/someday',
    );
    expect(screen.getByRole('link', { name: 'Logbook' })).toHaveAttribute(
      'href',
      '/logbook',
    );
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute(
      'href',
      '/tags',
    );
    expect(
      screen.getByRole('button', { name: 'Trash' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Settings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Logout' }),
    ).toBeInTheDocument();
  });

  it('does not render entries when closed', () => {
    setup(false);

    expect(screen.queryByRole('link', { name: 'Upcoming' })).toBeNull();
  });

  it('navigates via router link and closes the drawer', () => {
    const { onOpenChange } = setup(true);

    fireEvent.click(screen.getByRole('link', { name: 'Upcoming' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes the drawer when trash is clicked', () => {
    const { onOpenChange } = setup(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
