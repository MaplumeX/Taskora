import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

// 下拉刷新依赖 Engine 同步，测试里静默 no-op。
vi.mock('./engine/mobile-engine', () => ({
  requestPullSync: vi.fn().mockResolvedValue(undefined),
}));

import { MainApp } from './MainApp';

// 页面是 lazy() 路由：CI 冷启动时首次 import + transform 可能超过默认 1s。
const LAZY_PAGE = { timeout: 10_000 };
const LAZY_TEST_TIMEOUT = 15_000;

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

describe('MainApp (android navigation shell)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('lands on the home list with every list reachable', async () => {
    renderApp();

    // 桌面 Sidebar 因 CSS 隐藏但仍在 DOM 中，故限定在 main 内断言首页列表
    const main = await screen.findByRole('main');
    await waitFor(() => {
      expect(within(main).getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/today');
    });
    for (const [label, href] of [
      ['Inbox', '/inbox'],
      ['Upcoming', '/upcoming'],
      ['Calendar', '/calendar'],
      ['Anytime', '/anytime'],
      ['Someday', '/someday'],
      ['Logbook', '/logbook'],
      ['Trash', '/trash'],
      ['Tags', '/tags'],
    ]) {
      expect(within(main).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
    // 首页不再有底部标签栏
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it(
    'pushes into a list and returns to home with the back button',
    async () => {
      const user = userEvent.setup();
      renderApp();

      const main = await screen.findByRole('main');
      await user.click(await within(main).findByRole('link', { name: 'Today' }));
      expect(await screen.findByRole('heading', { name: 'Today' }, LAZY_PAGE)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(await within(main).findByRole('link', { name: 'Inbox' })).toBeInTheDocument();
      expect(window.location.pathname).toBe('/home');
    },
    LAZY_TEST_TIMEOUT,
  );

  it(
    'falls back to home when a list was opened without history',
    async () => {
      window.history.replaceState(null, '', '/today');
      const user = userEvent.setup();
      renderApp();

      expect(await screen.findByRole('heading', { name: 'Today' }, LAZY_PAGE)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Back' }));

      await waitFor(() => {
        expect(window.location.pathname).toBe('/home');
      });
    },
    LAZY_TEST_TIMEOUT,
  );
});
