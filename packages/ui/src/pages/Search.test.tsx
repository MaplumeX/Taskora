import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import {
  i18n,
  useAreasQuery,
  useFeedQuery,
  useProjectsQuery,
  useRevealTask,
  useTaskSearchQuery,
} from '@taskora/api';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  type FeedItem,
  type ProjectResponseDto,
  type TaskResponseDto,
  type TaskSearchHit,
} from '@taskora/shared';

import Search from './Search';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useFeedQuery: vi.fn(),
  useTaskSearchQuery: vi.fn(),
  useRevealTask: vi.fn(),
}));

// 任务行由 TaskListView 渲染（自有测试）；这里只看分节与传入的任务
vi.mock('@/components/task/TaskListView', () => ({
  TaskListView: ({ tasks }: { tasks: TaskResponseDto[] }) => (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  ),
}));

const NOW = '2026-09-01T00:00:00.000Z';

const PROJECT: ProjectResponseDto = {
  id: 'p1',
  title: 'Groceries',
  notes: null,
  areaId: null,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.ANYTIME,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  dueDate: null,
  completedAt: null,
  trashedAt: null,
  taskTotalCount: 0,
  taskCompletedCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const TRASH_FEED: FeedItem[] = [
  {
    ...PROJECT,
    id: 'p-trash',
    title: 'Old groceries',
    type: 'project',
    trashedAt: NOW,
    tags: [],
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
  },
];

function hit(id: string, title: string, task: Partial<TaskResponseDto> = {}): TaskSearchHit {
  return {
    task: {
      id,
      title,
      status: TaskStatus.ACTIVE,
      projectId: null,
      areaId: null,
      trashedAt: null,
      ...task,
    } as TaskResponseDto,
    matchedSubtasks: [],
    rank: 'title',
  };
}

let hitsByQuery: Record<string, TaskSearchHit[]> = {};
const NO_HITS: TaskSearchHit[] = [];
const reveal = vi.fn(async () => true);

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{pathname + search}</div>;
}

function renderSearch(q: string) {
  render(
    <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(q)}`]}>
      <Routes>
        <Route path="/search" element={<Search />} />
        <Route path="*" element={null} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const user = userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  hitsByQuery = {};
  vi.mocked(useProjectsQuery).mockReturnValue({ data: [PROJECT] } as never);
  vi.mocked(useAreasQuery).mockReturnValue({ data: [] } as never);
  vi.mocked(useFeedQuery).mockReturnValue({ data: TRASH_FEED } as never);
  vi.mocked(useTaskSearchQuery).mockImplementation((q: string) => {
    const searchedQuery = q.trim();
    return {
      data: searchedQuery ? (hitsByQuery[searchedQuery] ?? NO_HITS) : undefined,
      isPending: false,
      isError: false,
      searchedQuery,
    } as never;
  });
  vi.mocked(useRevealTask).mockReturnValue(reveal);
});

describe('Search（继续搜索）', () => {
  it('以 ?q= 为搜索词，按扩展范围搜索，并分节展示', () => {
    hitsByQuery.groceries = [
      hit('t-open', 'Groceries list'),
      hit('t-done', 'Groceries last week', { status: TaskStatus.COMPLETED }),
      hit('t-trash', 'Groceries draft', { trashedAt: NOW }),
    ];
    renderSearch('groceries');

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('groceries');
    expect(vi.mocked(useTaskSearchQuery)).toHaveBeenLastCalledWith('groceries', {
      extended: true,
    });
    const sections = screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'));
    expect(sections).toEqual(['Areas & Projects', 'Tasks', 'Logbook', 'Trash']);

    const places = within(screen.getByRole('region', { name: 'Areas & Projects' }));
    expect(places.getAllByRole('link').map((row) => row.textContent)).toEqual([
      'Groceries',
      'Old groceries',
    ]);
    expect(within(screen.getByRole('region', { name: 'Tasks' })).getByText('Groceries list'));
    expect(
      within(screen.getByRole('region', { name: 'Logbook' })).getByText('Groceries last week'),
    );
    const trash = within(screen.getByRole('region', { name: 'Trash' }));
    expect(trash.getByRole('img', { name: 'In Trash' })).toBeInTheDocument();
  });

  it('点击项目跳转，点击 Trash 中的任务定位到 Trash', async () => {
    hitsByQuery.groceries = [hit('t-trash', 'Groceries draft', { trashedAt: NOW })];
    renderSearch('groceries');

    await user.click(screen.getByRole('link', { name: /draft/ }));
    expect(reveal).toHaveBeenCalledWith('t-trash', { allowTrash: true });

    await user.click(screen.getByRole('link', { name: /^Old/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/projects/p-trash');
  });

  it('页头输入框修改搜索词并同步到地址', async () => {
    renderSearch('gro');
    const input = screen.getByRole('searchbox');
    await user.type(input, 'x');
    expect(screen.getByTestId('path')).toHaveTextContent('/search?q=grox');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/search$/);
  });
});
