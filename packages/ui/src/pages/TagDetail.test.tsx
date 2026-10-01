import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectStatus } from '@taskora/shared';
import type { FeedItem, ProjectResponseDto, TaskResponseDto } from '@taskora/shared';

const harness = vi.hoisted(() => ({
  items: [] as FeedItem[],
  projects: [] as ProjectResponseDto[],
  tasks: [] as TaskResponseDto[],
  effective: {} as Record<string, string[]>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('@/components/feed/GroupedFeedListView', () => ({
  GroupedFeedListView: ({ items }: { items: FeedItem[] }) => {
    harness.items = items;
    return null;
  },
}));
vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: () => ({ data: [{ id: 'work', title: 'Work', color: '#3B82F6' }] }),
  useTasksQuery: () => ({ data: harness.tasks, isLoading: false, isError: false }),
  useProjectsQuery: () => ({ data: harness.projects }),
  useEffectiveTags: () => ({
    ofProject: (p: { id: string }) => harness.effective[p.id] ?? [],
    ofTask: () => [],
    ofFeedItem: () => [],
  }),
}));

import TagDetail from './TagDetail';

const project = (id: string, status = ProjectStatus.ACTIVE, trashedAt: string | null = null) =>
  ({ id, title: id, status, trashedAt, areaId: null, tags: [] }) as unknown as ProjectResponseDto;

beforeEach(() => {
  harness.items = [];
  harness.tasks = [{ id: 't1', title: 't1', tags: [] } as unknown as TaskResponseDto];
  harness.projects = [
    project('p-tagged'),
    project('p-via-area'),
    project('p-plain'),
    project('p-done', ProjectStatus.COMPLETED),
    project('p-trashed', ProjectStatus.ACTIVE, '2026-09-01T00:00:00.000Z'),
  ];
  harness.effective = {
    'p-tagged': ['work'],
    'p-via-area': ['work'],
    'p-done': ['work'],
    'p-trashed': ['work'],
  };
});

describe('TagDetail', () => {
  it('列出有效 Tag 命中的未了结 Project 与任务，交给分组视图', () => {
    render(
      <MemoryRouter initialEntries={['/tags/work']}>
        <Routes>
          <Route path="/tags/:tagId" element={<TagDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument();
    expect(harness.items.map((item) => `${item.type}:${item.id}`)).toEqual([
      'project:p-tagged',
      'project:p-via-area',
      'task:t1',
    ]);
  });
});
