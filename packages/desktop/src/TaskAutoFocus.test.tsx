import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import type { TaskResponseDto } from '@taskora/shared';

// eager import：lazy + Suspense 在 CI 共享 runner 上首次模块转换可能超过
// waitFor 的短超时（测试卡在 fallback）。回归点（写后失效竞态）与 lazy
// 无关，直接顶层加载。
import ProjectDetailPage from '@taskora/ui/pages/ProjectDetail';

/**
 * 桌面 shell「项目页新建任务 → 展开行标题输入框自动聚焦」回归测试。
 *
 * 用户报告：项目页 / 领域页新建任务后标题输入框不聚焦；Today / Inbox
 * （feed 视图）正常。两类页面的差异：
 * - feed 页（正常）：列表数据来自 useFeedQuery，乐观更新不触碰 feed，
 *   新任务在 onSettled invalidate → refetch 之后才出现 —— 此时
 *   expandedId 早已设置，TaskItem 挂载即 expanded → 聚焦 effect 生效。
 * - tasks 页（异常）：列表数据来自 useTasksQuery(params)，useCreateTask
 *   的乐观更新会立即插入 temp 任务；桌面端还叠加 engine 写后
 *   onChange(origin local) → invalidateQueries 的时序。
 *
 * 本测试用与桌面 engine 相同的后端注入点（setTaskBackend）模拟本地副本
 * 读写（含写后同步 invalidate，模拟 desktop-engine 的 onChange 处理），
 * 走真实 ProjectDetail + 真实 useContentBottomActionsForRoute +
 * 真实 useCreateTask 的完整链路。
 */

vi.mock('@taskora/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@taskora/api')>();
  return {
    ...actual,
    useAuthStore: (selector?: (s: unknown) => unknown) =>
      selector
        ? selector({ token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false })
        : { token: 'token-1', user: { id: 'u1', email: 'u@x.io' }, refreshing: false },
    useAreasQuery: () => ({ data: [] }),
    useProjectHeadingsQuery: () => ({ data: [] }),
    useTagsQuery: () => ({ data: [] }),
    useFeedQuery: () => ({ data: [] }),
    useProjectCompletedTasks: () => ({ data: [] }),
  };
});

import {
  setTaskBackend,
  useUiInteractionStore,
  useContentBottomActionsForRoute,
  type TaskBackend,
} from '@taskora/api';
import { useSelectionStore } from '@taskora/api';

// ---- 模拟本地副本数据库（engine SQLite）----
let dbTasks: { id: string; title: string; projectId: string | null }[] = [];

function makeTaskDto(id: string, title: string, projectId: string | null): TaskResponseDto {
  return {
    id,
    title,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 模拟桌面端注入的 Engine task backend（含写后 invalidate 时序）。 */
function makeEngineLikeBackend(client: QueryClient): TaskBackend {
  const dto = (t: { id: string; title: string; projectId: string | null }) =>
    makeTaskDto(t.id, t.title, t.projectId);
  return {
    getTasks: async (params) => {
      await new Promise((r) => setTimeout(r, 0)); // 模拟 SQLite IPC 往返
      return dbTasks
        .filter((t) => (params?.projectId ? t.projectId === params.projectId : true))
        .map(dto);
    },
    getTask: async (id) => {
      await new Promise((r) => setTimeout(r, 5));
      const found = dbTasks.find((t) => t.id === id);
      if (!found) throw new Error(`Task not found: ${id}`);
      return dto(found);
    },
    getFeed: async () => [],
    createTask: async (data) => {
      const created = {
        id: `t-${dbTasks.length + 1}`,
        title: data.title,
        projectId: data.projectId ?? null,
      };
      dbTasks = [created, ...dbTasks];
      // engine.create → notifyChanged({origin:'local'}) → invalidate（同步、
      // 在 mutationFn resolve 之前触发，refetch 在飞行中与 onSuccess 竞争）。
      // 口径对齐 desktop-engine INVALIDATION_BY_ENTITY.task。
      for (const root of ['tasks', 'task', 'feed', 'projects', 'project']) {
        void client.invalidateQueries({ queryKey: [root] });
      }
      // 模拟 taskDto 组装（多次 SQLite IPC）：让写后 refetch 先于
      // mutationFn resolve 完成，制造真实的竞态交错
      await new Promise((r) => setTimeout(r, 50));
      return dto(created);
    },
    updateTask: async () => {
      throw new Error('not needed');
    },
    deleteTask: async () => {},
    restoreTask: async () => {
      throw new Error('not needed');
    },
    completeTask: async () => {
      throw new Error('not needed');
    },
    uncompleteTask: async () => {
      throw new Error('not needed');
    },
    cancelTask: async () => {
      throw new Error('not needed');
    },
    uncancelTask: async () => {
      throw new Error('not needed');
    },
    reorderTasks: async () => {},
    convertTaskToProject: async () => {
      throw new Error('not needed');
    },
    createSubtask: async () => {
      throw new Error('not needed');
    },
    updateSubtask: async () => {
      throw new Error('not needed');
    },
    deleteSubtask: async () => {},
    completeSubtask: async () => {
      throw new Error('not needed');
    },
    uncompleteSubtask: async () => {
      throw new Error('not needed');
    },
    cancelSubtask: async () => {
      throw new Error('not needed');
    },
    uncancelSubtask: async () => {
      throw new Error('not needed');
    },
    reorderSubtasks: async () => {},
    emptyTrash: async () => ({ deletedTasks: 0, deletedProjects: 0 }),
  } satisfies TaskBackend;
}

/** 与 ContentBottomBar 相同：真实 hook + + 按钮。 */
function TestBottomBar() {
  const { showAddTask, handleAddTask, addTaskPending } = useContentBottomActionsForRoute();
  if (!showAddTask) return null;
  return (
    <button onClick={handleAddTask} disabled={addTaskPending}>
      add-task
    </button>
  );
}

/** 与 AppShell 同构：Outlet 的兄弟节点（ContentBottomBar 的真实位置）。 */
function Shell() {
  return (
    <div>
      <Outlet />
      <TestBottomBar />
    </div>
  );
}

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

describe('desktop: auto-focus task title input after new task (project page)', () => {
  beforeEach(() => {
    dbTasks = [];
    useUiInteractionStore.getState().setExpandedId(null);
    useSelectionStore.getState().clearSelection();
    useUiInteractionStore.getState().clearPendingAutoEditId();
  });

  it('expands the new task and focuses its title input', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setTaskBackend(makeEngineLikeBackend(client));

    // 预填项目缓存（详情页标题等）
    const project = makeProject('p-0', 'Existing');
    client.setQueryData(['projects'], [project]);
    client.setQueryData(['project', 'p-0'], project);

    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/projects/p-0']}>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    // 详情页挂载
    await waitFor(
      () =>
        expect(screen.getByRole('heading', { name: 'Existing' })).toBeInTheDocument(),
      { timeout: 5000 },
    );

    fireEvent.click(screen.getByText('add-task'));

    // 新任务行应展开并聚焦标题输入框（placeholder: New Task）
    const input = await screen.findByPlaceholderText('New Task', {}, { timeout: 3000 });
    await waitFor(() => expect(input).toHaveFocus(), { timeout: 2000 });
  });
});
