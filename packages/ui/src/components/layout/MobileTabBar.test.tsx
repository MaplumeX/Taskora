import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { MobileTabBar } from './MobileTabBar';
import { useFeedQuery } from '@taskora/api';

// useBucketCounts 以 useFeedQuery 为唯一数据源，mock 掉 hook 而非底层请求
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeedQuery: vi.fn(),
}));
const mockUseFeedQuery = vi.mocked(useFeedQuery);

function setup(initialEntry = '/today', feedData: unknown[] = []) {
  const onOpenDrawer = vi.fn();
  mockUseFeedQuery.mockReturnValue({ data: feedData } as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MobileTabBar onOpenDrawer={onOpenDrawer} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onOpenDrawer };
}

describe('MobileTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 4 tab links and the more button', () => {
    setup('/today');

    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/today',
    );
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      '/calendar',
    );
    expect(screen.getByRole('link', { name: 'Anytime' })).toHaveAttribute(
      'href',
      '/anytime',
    );
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('shows count badges for inbox and today when items exist', () => {
    setup('/calendar', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const badges = screen.getAllByTestId('tab-count-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('3'); // Today
    expect(badges[1]).toHaveTextContent('3'); // Inbox
  });

  it('hides count badges when there are no items', () => {
    setup('/today');

    expect(screen.queryByTestId('tab-count-badge')).toBeNull();
  });

  it('caps the badge display at 99+', () => {
    const feedData = Array.from({ length: 120 }, (_, i) => ({ id: String(i) }));
    setup('/today', feedData);

    const badges = screen.getAllByTestId('tab-count-badge');
    for (const badge of badges) {
      expect(badge).toHaveTextContent('99+');
    }
  });

  it('excludes badge digits from the accessible link name', () => {
    setup('/today', [{ id: 'a' }]);

    expect(screen.getByRole('link', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('highlights the active tab', () => {
    setup('/inbox');

    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.className).toContain('text-foreground');
    const today = screen.getByRole('link', { name: 'Today' });
    expect(today.className).toContain('text-muted-foreground');
  });

  it('highlights the more button on drawer routes', () => {
    setup('/logbook');

    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).toContain('text-foreground');
  });

  it('does not highlight the more button on tab routes', () => {
    setup('/today');

    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).not.toContain('text-foreground');
  });

  it('calls onOpenDrawer when the more button is clicked', () => {
    const { onOpenDrawer } = setup('/today');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onOpenDrawer).toHaveBeenCalledOnce();
  });
});
