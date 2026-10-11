import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectStatus, Start } from '@taskora/shared';
import type { ProjectResponseDto } from '@taskora/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/feed/ProjectFeedRow', async () => {
  const ReactModule = await import('react');
  return {
    ProjectFeedRow: ({
      item,
      showScheduledBadge,
    }: {
      item: ProjectResponseDto;
      showScheduledBadge?: boolean;
    }) =>
      ReactModule.createElement(
        'div',
        { 'data-project-item': item.id, 'data-badge': String(!!showScheduledBadge) },
        item.title,
      ),
  };
});

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: () => ({ data: [] }),
  useReorderProjects: () => ({ mutate: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

import { LaterProjectSections } from './LaterProjectSections';
import { groupLaterProjects } from './laterProjectLayout';

function project(
  id: string,
  start: Start,
  scheduledDate: string | null = null,
  position: string | null = null,
): ProjectResponseDto {
  return {
    id,
    title: `Project ${id}`,
    notes: null,
    areaId: null,
    position,
    status: ProjectStatus.ACTIVE,
    start,
    scheduledDate,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

function renderSections(projects: ProjectResponseDto[]) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LaterProjectSections projects={projects} />
    </MemoryRouter>,
  );
}

function idsIn(section: HTMLElement) {
  return Array.from(section.querySelectorAll('[data-project-item]')).map(
    (el) => (el as HTMLElement).dataset.projectItem,
  );
}

describe('groupLaterProjects', () => {
  it('计划按日期升序（同日按 Position），Someday 按 Position，活跃项目被忽略', () => {
    const kinds: Record<string, 'scheduled' | 'someday' | null> = {
      late: 'scheduled',
      early2: 'scheduled',
      early1: 'scheduled',
      s2: 'someday',
      s1: 'someday',
      active: null,
    };
    const groups = groupLaterProjects(
      [
        project('late', Start.ANYTIME, '2099-03-01'),
        project('early2', Start.ANYTIME, '2099-01-01', 'a2'),
        project('s2', Start.SOMEDAY, null, 'a5'),
        project('active', Start.ANYTIME),
        project('early1', Start.ANYTIME, '2099-01-01', 'a1'),
        project('s1', Start.SOMEDAY, null, 'a3'),
      ],
      (p) => kinds[p.id],
    );
    expect(groups.scheduled.map((p) => p.id)).toEqual(['early1', 'early2', 'late']);
    expect(groups.someday.map((p) => p.id)).toEqual(['s1', 's2']);
  });
});

describe('LaterProjectSections', () => {
  it('按「计划」/「Someday」分节，计划行带日期 chip', () => {
    renderSections([
      project('some', Start.SOMEDAY),
      project('future', Start.ANYTIME, '2099-01-01'),
      project('active', Start.ANYTIME),
      project('past', Start.ANYTIME, '2020-01-01'),
    ]);
    const scheduled = screen.getByRole('region', { name: 'nav:upcoming' });
    const someday = screen.getByRole('region', { name: 'nav:someday' });
    expect(idsIn(scheduled)).toEqual(['future']);
    expect(idsIn(someday)).toEqual(['some']);
    expect(within(scheduled).getByText('Project future')).toHaveAttribute('data-badge', 'true');
    expect(within(someday).getByText('Project some')).toHaveAttribute('data-badge', 'false');
    expect(screen.queryByText('Project active')).not.toBeInTheDocument();
    expect(screen.queryByText('Project past')).not.toBeInTheDocument();
  });

  it('空小节不显示标题', () => {
    renderSections([project('some', Start.SOMEDAY)]);
    expect(screen.queryByRole('region', { name: 'nav:upcoming' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'nav:someday' })).toBeInTheDocument();
  });
});
