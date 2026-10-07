import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { i18n } from '@taskora/api';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type AreaResponseDto,
  type ProjectResponseDto,
  type TaskResponseDto,
} from '@taskora/shared';
import { mockDesktop } from '@/test/media';
import { TaskItem } from './TaskItem';

const state = vi.hoisted(() => ({
  projects: [] as ProjectResponseDto[],
  areas: [] as AreaResponseDto[],
  current: null as TaskResponseDto | null,
  update: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTaskQuery: () => ({ data: state.current }),
  useProjectQuery: (id: string) => ({ data: state.projects.find((p) => p.id === id) }),
  useProjectsQuery: () => ({ data: state.projects.filter((p) => !p.trashedAt) }),
  useAreasQuery: () => ({ data: state.areas }),
  useTagsQuery: () => ({ data: [] }),
  useUpdateTask: () => ({ mutate: state.update, isPending: false }),
  useLaterProjectKind: () => () => null,
}));

const NOW = '2026-10-07T00:00:00.000Z';
const task: TaskResponseDto = {
  id: 'task-1',
  title: 'Write report',
  notes: null,
  scheduledDate: null,
  scheduledType: ScheduledType.NONE,
  reminderTime: null,
  repeatRule: null,
  repeatSourceId: null,
  dueDate: null,
  bucket: TaskBucket.ANYTIME,
  status: TaskStatus.ACTIVE,
  completedAt: null,
  trashedAt: null,
  projectId: 'project-1',
  headingId: null,
  areaId: null,
  tags: [],
  subtasks: [],
  createdAt: NOW,
  updatedAt: NOW,
};

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

async function setup(initial: TaskResponseDto = task, route = '/today') {
  const user = userEvent.setup();
  const onRowClick = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = (value: TaskResponseDto, expanded = true, hidePlacement = false) => (
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Location />
        <TaskItem
          task={value}
          selectionState={expanded ? 'expanded' : 'idle'}
          hidePlacement={hidePlacement}
          projectTitle={value.projectId ? 'Report' : undefined}
          areaTitle={value.areaId ? 'Work' : undefined}
          onToggleComplete={() => {}}
          onRowClick={onRowClick}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(content(initial));
  // 等待展开行下一帧聚焦标题，避免测试在同一帧抢先点击弹层而被焦点移出关闭。
  await waitFor(() => expect(screen.getByDisplayValue(initial.title)).toHaveFocus());
  return {
    user,
    onRowClick,
    ...view,
    refresh: (value: TaskResponseDto = initial) => view.rerender(content(value)),
    collapse: () => view.rerender(content(initial, false)),
    setGrouping: (grouping: boolean) => view.rerender(content(initial, true, grouping)),
  };
}

const placement = (title = 'Report') => screen.getByRole('button', { name: `Located in ${title}` });

let restoreMedia: () => void;
beforeEach(async () => {
  vi.clearAllMocks();
  restoreMedia = mockDesktop(true);
  await i18n.changeLanguage('en');
  state.current = null;
  state.areas = [{ id: 'area-1', title: 'Work', notes: null, createdAt: NOW, updatedAt: NOW }];
  state.projects = [
    {
      id: 'project-1',
      title: 'Report',
      notes: null,
      areaId: 'area-1',
      status: ProjectStatus.ACTIVE,
      bucket: ProjectBucket.ANYTIME,
      scheduledType: ScheduledType.NONE,
      scheduledDate: null,
      dueDate: null,
      completedAt: null,
      trashedAt: null,
      taskTotalCount: 2,
      taskCompletedCount: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];
});
afterEach(() => {
  restoreMedia();
  vi.restoreAllMocks();
});

describe('展开任务的归属入口', () => {
  it('归属位于展开卡片背景/阴影外的右下方，卡片内不重复显示', async () => {
    await setup();
    const trigger = placement();
    const card = document.querySelector('[data-task-card]')!;
    expect(trigger).toHaveTextContent('Report');
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
    expect(trigger.parentElement).toHaveClass('ml-auto', 'min-w-0');
    expect(card).toHaveClass('bg-card', 'shadow-row-lift');
    expect(card).not.toContainElement(trigger);
    expect(card.nextElementSibling).toContainElement(trigger);
    expect(trigger.closest('.bg-card')).toBeNull();
    expect(trigger.closest('.shadow-row-lift')).toBeNull();
    expect(card).not.toHaveTextContent('Report');
    expect(screen.getByRole('button', { name: 'Date' }).parentElement).toHaveClass('ml-auto');
  });

  it.each([
    { current: task, route: '/projects/project-1' },
    { current: task, route: '/projects/project-1/?filter=active#tasks' },
    { current: { ...task, projectId: null, areaId: 'area-1' }, route: '/areas/area-1' },
    {
      current: { ...task, projectId: null, areaId: 'area-1' },
      route: '/areas/area-1/?filter=active',
    },
  ])('在直接所属页面 $route 隐藏右下角归属', async ({ current, route }) => {
    await setup(current, route);
    expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date' })).toBeInTheDocument();
  });

  it.each([
    { current: task, route: '/projects/project-10', title: 'Report' },
    { current: task, route: '/areas/area-1', title: 'Report' },
    {
      current: { ...task, projectId: null, areaId: 'area-1' },
      route: '/areas/area-10',
      title: 'Work',
    },
  ])('非直接所属页面 $route 仍显示 $title', async ({ current, route, title }) => {
    await setup(current, route);
    expect(placement(title)).toBeInTheDocument();
  });

  it('归属变为当前页面时立即隐藏入口', async () => {
    const { refresh } = await setup(task, '/areas/area-1');
    expect(placement()).toBeInTheDocument();
    state.current = { ...task, projectId: null, areaId: 'area-1' };
    refresh();
    expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
  });

  it('区域菜单补齐中文文案，更改区域仍打开移动界面', async () => {
    const { user } = await setup({ ...task, projectId: null, areaId: 'area-1' });
    await act(() => i18n.changeLanguage('zh'));
    await user.click(screen.getByRole('button', { name: '所属：Work' }));
    expect(screen.getByRole('button', { name: '前往区域' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '更改区域' }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Work' })).toHaveAttribute('aria-current', 'true');
  });

  it.each([
    { current: task, title: 'Report' },
    { current: { ...task, projectId: null, areaId: 'area-1' }, title: 'Work' },
  ])('分组视图隐藏 $title 的外侧入口，关闭分组后恢复', async ({ current, title }) => {
    const { setGrouping } = await setup(current);
    expect(placement(title)).toBeInTheDocument();
    setGrouping(true);
    expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
    // 不留原归属入口的空白占位。
    expect(document.querySelector('[data-task-card]')!.nextElementSibling).toBeNull();
    expect(screen.getByRole('button', { name: 'Date' })).toBeInTheDocument();
    setGrouping(false);
    expect(placement(title)).toBeInTheDocument();
  });

  it('收起后移除卡片外侧归属，恢复折叠行原有的归属小字', async () => {
    const { collapse } = await setup();
    collapse();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Report').closest('[data-task-card]')).not.toBeNull();
    expect(document.querySelector('[data-task-card]')).not.toHaveClass('bg-card');
  });

  it.each([
    { current: task, title: 'Report', route: '/projects/project-1', kind: 'project' },
    {
      current: { ...task, projectId: null, areaId: 'area-1' },
      title: 'Work',
      route: '/areas/area-1',
      kind: 'area',
    },
  ])('前往 $title 只打开对应页面，不写入或收起任务', async ({ current, title, route, kind }) => {
    const { user, onRowClick } = await setup(current);
    await user.click(placement(title));
    expect(screen.getByTestId('location')).toHaveTextContent('/today');
    expect(screen.getByRole('button', { name: `Change ${kind}` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Go to ${kind}` }));
    expect(screen.getByTestId('location')).toHaveTextContent(route);
    expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
    expect(state.update).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([TaskBucket.INBOX, TaskBucket.ANYTIME, TaskBucket.SCHEDULED])(
    '无归属时不把 %s Bucket 当作归属',
    async (bucket) => {
      await setup({ ...task, projectId: null, bucket });
      expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
    },
  );

  it('使用实时任务归属，而非列表中的旧 projectId', async () => {
    state.current = { ...task, projectId: null, areaId: 'area-1' };
    await setup();
    expect(placement('Work')).toBeInTheDocument();
    expect(screen.queryByText('Report')).not.toBeInTheDocument();
  });

  it('移动后实时更新归属，移出所有父级后隐藏入口', async () => {
    const { refresh } = await setup();
    expect(placement()).toBeInTheDocument();
    state.current = { ...task, projectId: null, areaId: 'area-1' };
    refresh();
    expect(placement('Work')).toBeInTheDocument();
    expect(screen.queryByText('Report')).not.toBeInTheDocument();
    state.current = { ...task, projectId: null, areaId: null, bucket: TaskBucket.INBOX };
    refresh();
    expect(screen.queryByRole('button', { name: /Located in/ })).not.toBeInTheDocument();
  });

  it('已进 Trash 的项目仍显示归属', async () => {
    state.projects[0].trashedAt = NOW;
    await setup({ ...task, trashedAt: NOW });
    expect(placement()).toBeInTheDocument();
  });

  it('长名称截断且提供完整标题；父级改名后更新', async () => {
    const title = 'A very long project title '.repeat(12).trim();
    state.projects[0].title = title;
    const { refresh, user } = await setup();
    const trigger = screen.getByTitle(title);
    expect(trigger).toHaveClass('max-w-full');
    expect(trigger.querySelector('.truncate')).toHaveTextContent(title.trim());
    state.projects[0] = { ...state.projects[0], title: 'Renamed' };
    refresh();
    expect(placement('Renamed')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('zh'));
    expect(screen.getByRole('button', { name: '所属：Renamed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '所属：Renamed' }));
    expect(screen.getByRole('button', { name: '前往项目' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更改项目' })).toBeInTheDocument();
  });

  it('更改打开移动界面，聚焦搜索，当前位置打勾；移动到区域后关闭', async () => {
    const { user, onRowClick } = await setup();
    await user.click(placement());
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('option', { name: 'Report' })).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('option', { name: 'Work' }));
    expect(state.update).toHaveBeenCalledWith(
      { id: task.id, data: { projectId: null, areaId: 'area-1' } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/today');
  });

  it('移动到 Inbox 沿用清除计划的 DTO，保存失败提示错误', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 'toast');
    state.update.mockImplementationOnce((_data, options) => options.onError());
    const { user } = await setup({
      ...task,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-08',
    });
    await user.click(placement());
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    await user.type(screen.getByRole('combobox'), 'inbox{Enter}');
    expect(state.update).toHaveBeenCalledWith(
      {
        id: task.id,
        data: {
          projectId: null,
          areaId: null,
          bucket: TaskBucket.INBOX,
          scheduledType: ScheduledType.NONE,
        },
      },
      expect.anything(),
    );
    expect(error).toHaveBeenCalledWith(i18n.t('common:saveFailed'));
  });

  it('键盘打开入口、切换更改；Escape 只关闭选择器，重新打开回到动作菜单', async () => {
    const { user, onRowClick } = await setup();
    placement().focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Go to project' })).toHaveFocus(),
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox')).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(placement()).toHaveFocus());
    expect(onRowClick).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Go to project' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('窄屏使用模态卡片，更改不自动弹键盘，关闭不收起任务', async () => {
    restoreMedia();
    restoreMedia = mockDesktop(false);
    const { user, onRowClick } = await setup();
    await user.click(placement());
    expect(screen.getByRole('dialog', { name: 'Located in Report' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change project' }));
    expect(screen.getByRole('dialog', { name: 'Move' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});
