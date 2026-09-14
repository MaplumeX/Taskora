import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

// All data hooks return empty data; auth is signed in.
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStore: (selector?: (s: unknown) => unknown) =>
    selector
      ? selector({ token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false })
      : { token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false },
  useProjectsQuery: () => ({ data: [] }),
  useAreasQuery: () => ({ data: [] }),
  useTagsQuery: () => ({ data: [] }),
  useFeedQuery: () => ({ data: [] }),
}));

import { MainApp } from './MainApp';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MainApp />
    </QueryClientProvider>,
  );
}

describe('MainApp (desktop navigation shell)', () => {
  it('renders the sidebar with all main nav entries', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /Inbox/ }).length).toBeGreaterThan(0);
    });
    for (const label of ['Today', 'Upcoming', 'Calendar', 'Anytime', 'Someday', 'Logbook', 'Trash']) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
  });

  it('lands on the Today view after boot', async () => {
    renderApp();

    await waitFor(() => {
      // Today page renders its heading + date line (feed hook returns empty).
      expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    });
  });
});
