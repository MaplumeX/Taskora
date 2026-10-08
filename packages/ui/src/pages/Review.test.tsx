import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  i18n,
  todayDateKey,
  useAreasQuery,
  useProjectsQuery,
  useReviewQueueQuery,
} from '@taskora/api';
import {
  addReviewInterval,
  ProjectStatus,
  type AreaResponseDto,
  type ProjectResponseDto,
  type ReviewQueue,
} from '@taskora/shared';

import { runReviewCommand } from '@/components/review/reviewCommands';
import { mockDesktop } from '@/test/media';

import Review from './Review';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useReviewQueueQuery: vi.fn(),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useMarkProjectReviewed: () => ({ mutate: markProject }),
  useMarkAreaReviewed: () => ({ mutate: markArea }),
  useUpdateProject: () => ({ mutate: updateProject }),
  useUpdateArea: () => ({ mutate: vi.fn() }),
}));
vi.mock('./ProjectDetail', () => ({ default: () => <p>project page</p> }));
vi.mock('./AreaDetail', () => ({ default: () => <p>area page</p> }));

const markProject = vi.hoisted(() => vi.fn());
const markArea = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());

const project = (id: string, overrides: Partial<ProjectResponseDto> = {}) =>
  ({
    id,
    title: id,
    status: ProjectStatus.ACTIVE,
    trashedAt: null,
    reviewInterval: { unit: 'week', count: 1 },
    nextReviewDate: '2026-03-10',
    ...overrides,
  }) as ProjectResponseDto;
const area = (id: string) =>
  ({ id, title: id, reviewInterval: null, nextReviewDate: null }) as AreaResponseDto;

let projects: ProjectResponseDto[];
let areas: AreaResponseDto[];
let queue: ReviewQueue;

function mockData() {
  vi.mocked(useReviewQueueQuery).mockReturnValue({ data: queue } as never);
  vi.mocked(useProjectsQuery).mockReturnValue({ data: projects } as never);
  vi.mocked(useAreasQuery).mockReturnValue({ data: areas } as never);
}

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderReview() {
  mockData();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/today', '/review']} initialIndex={1}>
        <Routes>
          <Route path="/review/*" element={<Review />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const path = () => screen.getByTestId('location').textContent;

describe('Review 页面', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    projects = [project('p1'), project('p2'), project('p3')];
    areas = [area('a1')];
    queue = {
      items: [
        { kind: 'project', id: 'p1' },
        { kind: 'area', id: 'a1' },
      ],
      upcoming: { date: '2026-03-12', count: 2 },
    };
  });

  it('进入是回顾列表：只列待回顾的对象；有待回顾时不提示下一次回顾日', () => {
    renderReview();
    expect(path()).toBe('/review');
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(screen.queryByText('p2')).not.toBeInTheDocument();
    expect(screen.queryByText(/Next review on/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Last reviewed: never')).toHaveLength(2);
  });

  it('开始回顾从第一个待回顾对象开始；标记已回顾写入并前进；最后一个标记后回到列表', () => {
    renderReview();
    fireEvent.click(screen.getByRole('button', { name: /Start Review/ }));
    expect(path()).toBe('/review/project/p1');
    expect(screen.getByText('project page')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Mark Reviewed/ }));
    expect(markProject).toHaveBeenCalledWith('p1', expect.anything());
    expect(path()).toBe('/review/area/a1');

    // 最后一个：下一个禁用，不结束本轮
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Mark Reviewed/ }));
    expect(markArea).toHaveBeenCalledWith('a1', expect.anything());
    expect(path()).toBe('/review');
  });

  it('上一个 / 下一个只在本轮列表里移动：到头、到尾时禁用', () => {
    renderReview();
    fireEvent.click(screen.getByText('p1'));
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(path()).toBe('/review/area/a1');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    act(() => {
      runReviewCommand('next');
    });
    expect(path()).toBe('/review/area/a1');
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }));
    expect(path()).toBe('/review/project/p1');
    expect(markProject).not.toHaveBeenCalled();
  });

  it('从列表中任一对象开始：快照仍是整个待回顾队列', () => {
    renderReview();
    fireEvent.click(screen.getByText('a1'));
    expect(path()).toBe('/review/area/a1');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('快捷键经命令通道驱动；上一个回到已标记的对象', () => {
    renderReview();
    fireEvent.click(screen.getByText('p1'));
    act(() => {
      runReviewCommand('markNext');
    });
    expect(path()).toBe('/review/area/a1');
    act(() => {
      runReviewCommand('previous');
    });
    expect(path()).toBe('/review/project/p1');
  });

  it('延后：改下次回顾日并前进，不算已回顾；队列里算已处理', () => {
    const restore = mockDesktop(true);
    try {
      renderReview();
      fireEvent.click(screen.getByText('p1'));
      fireEvent.click(screen.getByRole('button', { name: /Postpone/ }));
      fireEvent.click(screen.getByRole('button', { name: /In 1 week/ }));
      expect(updateProject).toHaveBeenCalledWith(
        {
          id: 'p1',
          data: { nextReviewDate: addReviewInterval(todayDateKey(), { unit: 'week', count: 1 }) },
        },
        expect.anything(),
      );
      expect(markProject).not.toHaveBeenCalled();
      expect(path()).toBe('/review/area/a1');

      fireEvent.click(screen.getByRole('button', { name: 'This Review' }));
      expect(screen.getByLabelText('Done')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('回顾栏只有一个「回顾设置」按钮，点开与「…」菜单同一个回顾选择器', () => {
    renderReview();
    fireEvent.click(screen.getByText('p1'));
    expect(screen.queryByRole('button', { name: /Next review/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review Settings' }));
    expect(screen.getByRole('button', { name: 'Increase review interval' })).toBeInTheDocument();
    expect(screen.getByText('Last reviewed: never')).toBeInTheDocument();
  });

  it('延后快捷键打开延后菜单', () => {
    renderReview();
    fireEvent.click(screen.getByText('p1'));
    act(() => {
      runReviewCommand('postpone');
    });
    expect(screen.getByRole('button', { name: /Pick a date/ })).toBeInTheDocument();
  });

  it('没有待回顾对象：空状态，开始回顾不可用', () => {
    queue = { items: [], upcoming: null };
    renderReview();
    expect(screen.getByText('Nothing to review')).toBeInTheDocument();
    expect(screen.getByText('Nothing is scheduled for review.')).toBeInTheDocument();

    cleanup();
    queue = { items: [], upcoming: { date: '2026-03-12', count: 2 } };
    renderReview();
    expect(screen.getByText(/Next review on .* 2 items/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Review/ })).toBeDisabled();
  });

  it('桌面端：本轮队列可展开并跳转；退出回到列表', () => {
    const restore = mockDesktop(true);
    try {
      renderReview();
      fireEvent.click(screen.getByText('p1'));
      fireEvent.click(screen.getByRole('button', { name: 'This Review' }));
      fireEvent.click(screen.getByRole('button', { name: /a1/ }));
      expect(path()).toBe('/review/area/a1');
      fireEvent.click(screen.getByRole('button', { name: /Exit Review/ }));
      expect(path()).toBe('/review');
    } finally {
      restore();
    }
  });
});
