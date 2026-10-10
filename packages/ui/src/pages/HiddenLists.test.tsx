import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { useAreasQuery, useFeedQuery, usePreferencesStore, useProjectsQuery } from '@taskora/api';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type AreaResponseDto,
  type FeedItem,
  type ProjectFeedItem,
  type ProjectResponseDto,
  type TaskFeedItem,
} from '@taskora/shared';

import AllProjects, { allProjectSections } from './AllProjects';
import LoggedProjects from './LoggedProjects';
import Tomorrow from './Tomorrow';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeedQuery: vi.fn(),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useEffectiveTags: () => ({
    ofTask: () => [],
    ofProject: () => [],
    ofFeedItem: () => [],
  }),
}));

// 行渲染与拖拽列表各有测试；这里只看页面选出了哪些条目、怎么分节
vi.mock('@/components/feed/TimeViewFeedList', () => ({
  TimeViewFeedList: ({ items }: { items: FeedItem[] }) => (
    <ul aria-label="feed">
      {items.map((item) => (
        <li key={item.id}>{item.id}</li>
      ))}
    </ul>
  ),
}));
vi.mock('@/components/feed/FeedItemRow', () => ({
  FeedItemRow: ({ item }: { item: FeedItem }) => <div role="listitem">{item.id}</div>,
}));
vi.mock('@/components/feed/ProjectFeedRow', () => ({
  ProjectFeedRow: ({ item }: { item: ProjectResponseDto }) => <div role="listitem">{item.id}</div>,
}));
vi.mock('@/components/feed/AreaGroupHeaderRow', () => ({
  AreaGroupHeaderRow: ({ area }: { area: AreaResponseDto }) => <h2>{area.title}</h2>,
}));

const NOW = '2026-10-10T04:00:00.000Z';

function task(id: string, fields: Partial<TaskFeedItem> = {}): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    tags: [],
    projectId: null,
    headingId: null,
    areaId: null,
    ...fields,
  } as TaskFeedItem;
}

function project(id: string, fields: Partial<ProjectResponseDto> = {}): ProjectResponseDto {
  return {
    id,
    title: id,
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
    tags: [],
    ...fields,
  };
}

function area(id: string): AreaResponseDto {
  return { id, title: id, notes: null, createdAt: NOW, updatedAt: NOW };
}

function feed(items: FeedItem[]) {
  vi.mocked(useFeedQuery).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
  } as never);
}

function renderPage(page: ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const initialPreferences = usePreferencesStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  usePreferencesStore.setState({
    timeZone: 'Asia/Shanghai',
    legacyDateTimeZone: 'Asia/Shanghai',
  });
  vi.mocked(useProjectsQuery).mockReturnValue({ data: [], isLoading: false } as never);
  vi.mocked(useAreasQuery).mockReturnValue({ data: [] } as never);
});

afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({
    timeZone: initialPreferences.timeZone,
    legacyDateTimeZone: initialPreferences.legacyDateTimeZone,
  });
});

describe('Tomorrow', () => {
  it('只收 Upcoming 中计划日期为明天的条目（截止日期在明天不算）', () => {
    const dated = (id: string, day: string, fields: Partial<TaskFeedItem> = {}) =>
      task(id, { scheduledType: ScheduledType.DATE, scheduledDate: day, ...fields });
    feed([
      dated('t-tomorrow', '2026-10-11'),
      dated('t-later', '2026-10-12', { dueDate: '2026-10-11' }),
      {
        ...dated('p-tomorrow', '2026-10-11'),
        type: 'project',
        taskTotalCount: 0,
        taskCompletedCount: 0,
      } as unknown as ProjectFeedItem,
    ]);
    renderPage(<Tomorrow />);
    expect(useFeedQuery).toHaveBeenCalledWith('upcoming');
    const list = within(screen.getByRole('list', { name: 'feed' }));
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      't-tomorrow',
      'p-tomorrow',
    ]);
  });
});

describe('All Projects', () => {
  it('无区域的项目在前，之后按区域顺序分节；只收未了结、未进 Trash 的项目', () => {
    const sections = allProjectSections(
      [
        project('p-a2', { areaId: 'a2' }),
        project('p-loose'),
        project('p-done', { status: ProjectStatus.COMPLETED }),
        project('p-trashed', { trashedAt: NOW }),
        project('p-later', { areaId: 'a1', scheduledType: ScheduledType.SOMEDAY }),
        project('p-a1', { areaId: 'a1' }),
      ],
      [area('a1'), area('a2'), area('a-empty')],
    );
    expect(
      sections.map((section) => [section.area?.id ?? null, section.projects.map((p) => p.id)]),
    ).toEqual([
      [null, ['p-loose']],
      ['a1', ['p-later', 'p-a1']],
      ['a2', ['p-a2']],
    ]);
  });

  it('页面按节渲染区域标题与项目行', () => {
    vi.mocked(useProjectsQuery).mockReturnValue({
      data: [project('p-loose'), project('p-a1', { areaId: 'a1' })],
      isLoading: false,
    } as never);
    vi.mocked(useAreasQuery).mockReturnValue({ data: [area('a1')] } as never);
    renderPage(<AllProjects />);
    const a1 = within(screen.getByRole('region', { name: 'a1' }));
    expect(a1.getByRole('heading', { name: 'a1' })).toBeInTheDocument();
    expect(a1.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['p-a1']);
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'p-loose',
      'p-a1',
    ]);
  });
});

describe('Logged Projects', () => {
  it('只列 Logbook 中的项目', () => {
    feed([
      task('t-done', { status: TaskStatus.COMPLETED, completedAt: '2026-10-10T01:00:00.000Z' }),
      {
        ...project('p-done', {
          status: ProjectStatus.COMPLETED,
          completedAt: '2026-10-09T01:00:00.000Z',
        }),
        type: 'project',
      } as unknown as ProjectFeedItem,
    ]);
    renderPage(<LoggedProjects />);
    expect(useFeedQuery).toHaveBeenCalledWith('logbook');
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['p-done']);
  });
});
