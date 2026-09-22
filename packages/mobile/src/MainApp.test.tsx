import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// 下拉刷新依赖 Engine 同步，测试里静默 no-op。
vi.mock('./engine/mobile-engine', () => ({
  requestPullSync: vi.fn().mockResolvedValue(undefined),
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

describe('MainApp (android navigation shell)', () => {
  it('renders the mobile tab bar with the four primary destinations', async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /Today/ }).length).toBeGreaterThan(0);
    });
    for (const label of ['Inbox', 'Calendar', 'Anytime']) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
    // 「更多」抽屉入口
    expect(screen.getByRole('button', { name: /More/ })).toBeInTheDocument();
  });

  it('lands on the Today view after boot', async () => {
    renderApp();

    await waitFor(() => {
      // Today page renders its heading + date line (feed hook returns empty).
      expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    });
  });

  it('opens the more drawer from the tab bar and closes it again', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    });

    // 抽屉未开：无 dialog，更多导航不可达（桌面 Sidebar 因 CSS 隐藏但仍在
    // DOM 中，故用 dialog 角色判定抽屉而非链接存在性）
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /More/ }));

    // 抽屉打开：出现「更多导航」dialog，次级入口可达
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveAccessibleName('More navigation');
    expect(within(drawer).getByRole('link', { name: /Upcoming/ })).toBeInTheDocument();

    // 关闭后消失（Escape 即 Dialog 的 onOpenChange(false)）
    await user.keyboard('[Escape]');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
