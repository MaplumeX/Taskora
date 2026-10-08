import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { i18n, useAreasQuery, useProjectsQuery, useReviewQueueQuery } from '@taskora/api';
import {
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
  useUpdateProject: () => ({ mutate: vi.fn() }),
  useUpdateArea: () => ({ mutate: vi.fn() }),
}));
vi.mock('./ProjectDetail', () => ({ default: () => <p>project page</p> }));
vi.mock('./AreaDetail', () => ({ default: () => <p>area page</p> }));

const markProject = vi.hoisted(() => vi.fn());
const markArea = vi.hoisted(() => vi.fn());

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
    projects = [project('p1'), project('p2')];
    areas = [area('a1')];
    queue = {
      items: [
        { kind: 'project', id: 'p1' },
        { kind: 'area', id: 'a1' },
      ],
      upcoming: { date: '2026-03-12', count: 2 },
    };
  });

  it('进入即从第一个对象开始，显示进度与完整页面', () => {
    renderReview();
    expect(path()).toBe('/review/project/p1');
    expect(screen.getByText('project page')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('标记已回顾写入并进入下一个；跳过不写入；走完显示空状态与下一次回顾日', () => {
    renderReview();
    fireEvent.click(screen.getByRole('button', { name: /Mark Reviewed/ }));
    expect(markProject).toHaveBeenCalledWith('p1', expect.anything());
    expect(path()).toBe('/review/area/a1');
    expect(screen.getByText('area page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(markArea).not.toHaveBeenCalled();
    expect(path()).toBe('/review/done');
    expect(screen.getByText('Review finished')).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('快捷键经命令通道驱动；上一个回到已标记的对象', () => {
    renderReview();
    act(() => {
      runReviewCommand('markNext');
    });
    expect(path()).toBe('/review/area/a1');
    act(() => {
      runReviewCommand('previous');
    });
    expect(path()).toBe('/review/project/p1');
  });

  it('没有待回顾对象：直接显示空状态', () => {
    queue = { items: [], upcoming: null };
    renderReview();
    expect(path()).toBe('/review/done');
    expect(screen.getByText('Nothing to review')).toBeInTheDocument();
    expect(screen.getByText('Nothing is scheduled for review.')).toBeInTheDocument();
  });

  it('桌面端：退出回到进入回顾前的页面', () => {
    const restore = mockDesktop(true);
    try {
      renderReview();
      fireEvent.click(screen.getByRole('button', { name: /Exit Review/ }));
      expect(path()).toBe('/today');
    } finally {
      restore();
    }
  });
});
