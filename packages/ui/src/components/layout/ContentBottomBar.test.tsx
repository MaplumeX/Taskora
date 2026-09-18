import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContentBottomBar } from './ContentBottomBar';
import { useContentBottomActionsForRoute, i18n } from '@taskora/api';

// 与 MobileFab.test 同一 harness 模式：mock route-aware hook 而非底层 mutation。
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useContentBottomActionsForRoute: vi.fn(),
}));
const mockHook = vi.mocked(useContentBottomActionsForRoute);

const baseActions = {
  showAddTask: true,
  showAddProject: true,
  showAddHeading: true,
  handleAddTask: vi.fn(),
  handleAddProject: vi.fn(),
  handleAddHeading: vi.fn(),
  addTaskPending: false,
  addProjectPending: false,
  addHeadingPending: false,
};

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/today']}>
        <ContentBottomBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const user = userEvent.setup();

describe('ContentBottomBar — 按钮 hint 提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.mockReturnValue({ ...baseActions } as never);
    // jsdom 的 navigator 检测可能落到 zh/en 任一语言，固定为 en 保证断言稳定。
    void i18n.changeLanguage('en');
  });

  it('agent 页不渲染底部动作条', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/agent']}>
          <ContentBottomBar />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hover 图标按钮浮出 hint 文案与键位（jsdom → web 平台 Alt 系）', async () => {
    renderBar();

    await user.hover(screen.getByRole('button', { name: 'Search tasks' }));
    expect(await screen.findByText('Search tasks')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+F')).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByText('Add task')).toBeInTheDocument();
    expect(screen.getByText('Alt+N')).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Add project' }));
    expect(await screen.findByText('Add project')).toBeInTheDocument();
    expect(screen.getByText('Alt+Shift+N')).toBeInTheDocument();

    await user.hover(screen.getByRole('button', { name: 'Add heading' }));
    expect(await screen.findByText('Add heading')).toBeInTheDocument();
    expect(screen.getByText('Alt+H')).toBeInTheDocument();
  });
});
