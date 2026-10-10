import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import React from 'react';

import type { ProjectResponseDto } from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

import { i18n } from '@taskora/api';

import { mockDesktop } from '@/test/media';
import { ProjectContextMenu, ProjectMoreMenu } from './ProjectContextMenu';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useLoggingActions: () => ({ setLoggingMode: vi.fn(), logCompleted: vi.fn() }),
  useAreasQuery: () => ({ data: [
    { id: 'work', title: 'Work' },
    { id: 'home', title: 'Home' },
    { id: 'homework', title: 'Homework' },
  ] }),
  useUpdateProject: () => ({ mutate: updateMock, isPending: false }),
  useCompleteProject: () => ({ mutate: completeMock, isPending: false }),
  useUncompleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteProject: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreProject: () => ({ mutate: vi.fn(), isPending: false }),
  useSkipProject: () => ({ mutate: skipMock, isPending: false }),
  useDuplicateTask: () => ({ mutateAsync: vi.fn() }),
  useDuplicateProject: () => ({ mutateAsync: duplicateMock }),
}));

const updateMock = vi.hoisted(() => vi.fn());
const completeMock = vi.hoisted(() => vi.fn());
const skipMock = vi.hoisted(() => vi.fn());
const duplicateMock = vi.hoisted(() => vi.fn(async (id: string) => ({ id: `${id}-copy` })));

const baseProject: ProjectResponseDto = {
  id: 'project-1',
  title: 'Weekly review',
  notes: null,
  areaId: null,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.ANYTIME,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  dueDate: null,
  repeatRule: null,
  repeatSourceId: null,
  completedAt: null,
  trashedAt: null,
  tags: [],
  taskTotalCount: 0,
  taskCompletedCount: 0,
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
};

function renderMenu(project: ProjectResponseDto) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectContextMenu project={project} current={project}>
          <span>{project.title}</span>
        </ProjectContextMenu>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.contextMenu(screen.getByText(project.title));
}

describe('ProjectContextMenu — 重复项目（recurring-projects）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无计划日期的项目不提供「重复」与「跳过本次」', async () => {
    renderMenu(baseProject);
    await screen.findByRole('button', { name: /^(Mark Complete|标记完成)/ });
    expect(screen.queryByRole('button', { name: /^(Repeat|重复)$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip Occurrence|跳过本次/ })).toBeNull();
  });

  it('DATE 项目提供「重复」；带规则时提供「跳过本次」', async () => {
    renderMenu({
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
      bucket: ProjectBucket.SCHEDULED,
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    expect(await screen.findByRole('button', { name: /^(Repeat|重复)$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip Occurrence|跳过本次/ }));
    expect(skipMock).toHaveBeenCalledWith('project-1', expect.anything());
  });

  it('完成仍有未了结任务的项目：先询问，选择后带 settleRemaining 完成', async () => {
    renderMenu({ ...baseProject, taskTotalCount: 3, taskCompletedCount: 1 });
    fireEvent.click(await screen.findByRole('button', { name: /^(Mark Complete|标记完成)/ }));
    expect(completeMock).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', { name: /Mark All as Completed|全部标记为完成/ }),
    );
    expect(completeMock).toHaveBeenCalledWith(
      { id: 'project-1', settleRemaining: 'completed' },
      expect.anything(),
    );
  });
});


describe('项目移动', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage('en');
  });

  async function openMove(project = baseProject) {
    renderMenu(project);
    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    return screen.findByRole('combobox');
  }

  it('右键入口只列无区域与各区域，当前位置打勾并高亮', async () => {
    await openMove({ ...baseProject, areaId: 'work' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'No Area', 'Work', 'Home', 'Homework',
    ]);
    const work = screen.getByRole('option', { name: 'Work' });
    expect(work).toHaveAttribute('aria-current', 'true');
    expect(work).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(work);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('搜索按前缀优先，键盘选中后仅修改区域并关闭', async () => {
    const input = await openMove({
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2030-01-07',
      repeatRule: { unit: 'week', interval: 1, anchor: 'scheduled' },
    });
    fireEvent.change(input, { target: { value: 'work' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Work', 'Homework',
    ]);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'project-1', data: { areaId: 'homework' } }, expect.anything(),
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('可移为无区域项目', async () => {
    await openMove({ ...baseProject, areaId: 'work' });
    fireEvent.click(screen.getByRole('option', { name: 'No Area' }));
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'project-1', data: { areaId: null } }, expect.anything(),
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('搜索无结果显示提示，清空搜索恢复当前位置；Esc 关闭', async () => {
    const input = await openMove({ ...baseProject, areaId: 'work' });
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matching areas')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(updateMock).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByRole('option', { name: 'Work' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('详情页更多菜单使用相同移动选择器', async () => {
    render(<MemoryRouter><ProjectMoreMenu project={baseProject} current={baseProject} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('option', { name: 'Home' }));
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'project-1', data: { areaId: 'home' } }, expect.anything(),
    );
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('窄屏更多菜单为底部动作面板，选择器为字段卡片', async () => {
    render(<MemoryRouter><ProjectMoreMenu project={baseProject} current={baseProject} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await screen.findByRole('dialog', { name: baseProject.title });
    await user.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('dialog', { name: 'Move' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: baseProject.title })).toBeNull();
  });

  it('桌面更多菜单仍为浮层', async () => {
    onTestFinished(mockDesktop(true));
    render(<MemoryRouter><ProjectMoreMenu project={baseProject} current={baseProject} /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('button', { name: 'Move' }));
    await user.click(await screen.findByRole('option', { name: 'Home' }));
    expect(updateMock).toHaveBeenCalledWith(
      { id: 'project-1', data: { areaId: 'home' } }, expect.anything(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('复制项目（Duplicate）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage('en');
  });

  it('右键菜单「复制」复制该项目', async () => {
    renderMenu(baseProject);
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await vi.waitFor(() => expect(duplicateMock).toHaveBeenCalledWith('project-1'));
  });

  it('Trash 中不提供「复制」', async () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProjectContextMenu project={baseProject} current={baseProject} variant="trash">
            <span>{baseProject.title}</span>
          </ProjectContextMenu>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.contextMenu(screen.getByText(baseProject.title));
    await screen.findByRole('button', { name: 'Put Back' });
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });

  it('项目页更多菜单复制后打开副本', async () => {
    function ProjectPage() {
      const { id } = useParams();
      return id === 'project-1' ? (
        <ProjectMoreMenu project={baseProject} current={baseProject} />
      ) : (
        <span>opened {id}</span>
      );
    }
    render(
      <MemoryRouter initialEntries={['/projects/project-1']}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }));
    expect(await screen.findByText('opened project-1-copy')).toBeInTheDocument();
  });
});
