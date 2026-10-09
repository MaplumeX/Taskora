import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContentBottomBar } from './ContentBottomBar';
import {
  useAssistantUiStore,
  useContentBottomActionsForRoute,
  useUiInteractionStore,
  i18n,
} from '@taskora/api';

// 与 MobileFab.test 同一 harness 模式：mock route-aware hook 而非底层 mutation。
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useContentBottomActionsForRoute: vi.fn(),
  useTaskQuery: (id: string) => ({
    data: id ? { id, title: 'Open task', status: 'ACTIVE' } : undefined,
  }),
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

    await user.hover(screen.getByRole('button', { name: 'Quick Find' }));
    expect(await screen.findByText('Quick Find')).toBeInTheDocument();
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

describe('ContentBottomBar — 助手面板入口（assistant-panel issue 03）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.mockReturnValue({ ...baseActions } as never);
    void i18n.changeLanguage('en');
    useAssistantUiStore.setState({ panelOpen: false });
  });

  it('点击开关面板，按下态跟随面板状态，hint 带键位', async () => {
    renderBar();
    const button = screen.getByRole('button', { name: 'Assistant panel' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.hover(button);
    expect(await screen.findByText('Alt+J')).toBeInTheDocument();

    await user.click(button);
    expect(useAssistantUiStore.getState().panelOpen).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await user.click(button);
    expect(useAssistantUiStore.getState().panelOpen).toBe(false);
  });
});

describe('ContentBottomBar — 任务展开时切换（对齐 Things 3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.mockReturnValue({ ...baseActions } as never);
    void i18n.changeLanguage('en');
  });

  it('展开任务时换成移动 / 删除 / 更多，收起即切回', async () => {
    useUiInteractionStore.setState({ expandedId: 'task-1' });
    renderBar();
    expect(screen.getByRole('button', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quick Find' })).toBeNull();

    act(() => useUiInteractionStore.setState({ expandedId: null }));
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
  });
});
