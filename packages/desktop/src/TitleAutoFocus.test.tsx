import { StrictMode, Suspense, lazy } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * 桌面 shell「新建项目 → 标题输入框自动聚焦」回归测试。
 *
 * 覆盖两条路径（与真实 SidebarBottomBar.handleNewProject 的动作序列一致：
 * mutate 乐观更新缓存 → setPendingAutoEditId → navigate）：
 *
 * 1. 首次挂载：从其他页面（如 /today）新建项目，详情页 lazy 加载后
 *    InlineTitleEdit 以 autoFocusAndSelect=true 挂载 → 进入编辑态并聚焦。
 * 2. 路由组件复用（回归点）：已处于某项目详情页时再新建项目，
 *    /projects/:id → /projects/:id 只是 params 变化，路由复用页面组件，
 *    InlineTitleEdit 不重新挂载 —— useState(autoFocusAndSelect) 初始值
 *    不会重新执行，若组件只依赖初始值则永远不进入编辑态。
 *    （AreaDetail 的 /areas/:id 同理。）
 *
 * 桌面端还叠加 engine 写后 invalidate → refetch 替换缓存数组的行为，
 * 用 invalidateQueries 模拟，确认不干扰聚焦。
 */

vi.mock('@taskora/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@taskora/api')>();
  return {
    ...actual,
    useAuthStore: (selector?: (s: unknown) => unknown) =>
      selector
        ? selector({ token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false })
        : { token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false },
    // 详情页其余数据 hooks 返回空
    useAreasQuery: () => ({ data: [] }),
    useTasksQuery: () => ({ data: [] }),
    useProjectHeadingsQuery: () => ({ data: [] }),
    useTagsQuery: () => ({ data: [] }),
    useFeedQuery: () => ({ data: [] }),
    useProjectCompletedTasks: () => ({ data: [] }),
  };
});

import { useUiInteractionStore } from '@taskora/api';

function makeProject(id: string, title: string) {
  return {
    id,
    title,
    notes: null,
    areaId: null,
    sortOrder: 0,
    status: 'ACTIVE',
    bucket: 'ANYTIME',
    scheduledType: 'NONE',
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 与真实 useCreateProject 相同的缓存手术序列（乐观 temp → 替换 → invalidate）。 */
function useCreateProjectLike(client: QueryClient) {
  return {
    mutate: async () => {
      // onMutate：乐观插入 temp
      await client.cancelQueries({ queryKey: ['projects'] });
      const tempId = 'temp-id';
      client.setQueryData(['projects'], [
        ...(client.getQueryData<unknown[]>(['projects']) ?? []),
        makeProject(tempId, ''),
      ]);
      // mutationFn：本地写入（engine 即 SQLite，立即可见）
      const created = makeProject('p-1', '');
      await new Promise((r) => setTimeout(r, 10));
      // onSuccess：替换 temp 为真实值 + 写 detail 缓存
      client.setQueryData(
        ['projects'],
        (old: unknown[] | undefined) =>
          old?.map((p) => ((p as { id: string }).id === tempId ? created : p)),
      );
      client.setQueryData(['project', created.id], created);
      return created;
    },
  };
}

/** 与真实 SidebarBottomBar.handleNewProject 相同动作：setPendingAutoEditId → navigate。 */
function TestSidebar({ client }: { client: QueryClient }) {
  const navigate = useNavigate();
  const createProject = useCreateProjectLike(client);
  const handleNewProject = () => {
    void createProject.mutate().then((p) => {
      useUiInteractionStore.getState().setPendingAutoEditId(p.id);
      navigate(`/projects/${p.id}`);
      // 桌面 engine：本地写后 onChange(origin 'local') → invalidate →
      // active query refetch，refetch 结果用全新数组替换缓存。
      setTimeout(() => {
        void client.invalidateQueries({ queryKey: ['projects'] });
      }, 30);
    });
  };
  return <button onClick={handleNewProject}>new-project</button>;
}

const LazyProjectDetail = lazy(async () => ({
  default: (await import('@taskora/ui/pages/ProjectDetail')).default,
}));
const LazyToday = lazy(async () => ({
  default: () => <div>today</div>,
}));

function PageFallback() {
  return <div>fallback</div>;
}

function renderDesktopShell(client: QueryClient, initialEntry: string) {
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/today" element={<LazyToday />} />
              <Route path="/projects/:id" element={<LazyProjectDetail />} />
            </Routes>
          </Suspense>
          <TestSidebar client={client} />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('desktop: auto-focus title input after new project', () => {
  beforeEach(() => {
    useUiInteractionStore.getState().clearPendingAutoEditId();
  });

  it('enters edit mode and focuses the title when navigating from another page', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderDesktopShell(client, '/today');

    await waitFor(() => expect(screen.getByText('today')).toBeInTheDocument());

    fireEvent.click(screen.getByText('new-project'));

    const input = await screen.findByRole('textbox', undefined, { timeout: 3000 });
    await waitFor(() => expect(input).toHaveFocus(), { timeout: 2000 });
  });

  it('enters edit mode and focuses the title when the detail page is reused (route param change)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 预填缓存：模拟页面加载后 useProjectsQuery 已有的数据
    const existing = makeProject('p-0', 'Existing');
    client.setQueryData(['projects'], [existing]);
    client.setQueryData(['project', 'p-0'], existing);
    renderDesktopShell(client, '/projects/p-0');

    // 现有项目详情页挂载（标题为 h1，非编辑态）
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Existing' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('new-project'));

    // 新项目详情页应进入标题编辑态并聚焦
    const input = await screen.findByRole('textbox', undefined, { timeout: 3000 });
    await waitFor(() => expect(input).toHaveFocus(), { timeout: 2000 });
  });
});
