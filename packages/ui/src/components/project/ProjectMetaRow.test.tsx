import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectResponseDto, TagResponseDto } from '@taskora/shared';
import { ProjectBucket, ProjectStatus, ScheduledType } from '@taskora/shared';

import { ProjectMetaRow } from './ProjectMetaRow';

const mutationMocks = vi.hoisted(() => ({
  update: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({ invalidateQueries: mutationMocks.invalidate }),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useUpdateProject: () => ({ mutate: mutationMocks.update }),
  useUpdateArea: () => ({ mutate: vi.fn() }),
  useMarkProjectReviewed: () => ({ mutate: vi.fn() }),
  useMarkAreaReviewed: () => ({ mutate: vi.fn() }),
  useTagsQuery: () => ({
    data: [tagA, tagB].map((t) => ({ ...t })),
  }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
}));

const tagA: TagResponseDto = {
  id: 'tag-a',
  title: 'design',
  color: '#3B82F6',
  parentId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const tagB: TagResponseDto = {
  id: 'tag-b',
  title: 'urgent',
  color: '#EF4444',
  parentId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const baseProject: ProjectResponseDto = {
  id: 'project-1',
  title: 'Website Redesign',
  notes: null,
  areaId: null,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.ANYTIME,
  scheduledType: ScheduledType.NONE,
  scheduledDate: null,
  dueDate: null,
  completedAt: null,
  trashedAt: null,
  tags: [tagA],
  taskTotalCount: 10,
  taskCompletedCount: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('ProjectMetaRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders scheduled and due badges when set, plus tag pills', () => {
    const project: ProjectResponseDto = {
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2999-01-02T00:00:00.000Z',
      dueDate: '2999-01-03T00:00:00.000Z',
    };
    render(<ProjectMetaRow project={project} />);

    // 日期徽章触发器携带格式化后的日期文字（非空 textContent）。
    const buttons = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(buttons.some((text) => text.trim() !== '')).toBe(true);
    // 标签胶囊直接显示标签名。
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('design');
  });

  it('renders only the next review badge when no other metadata is set', () => {
    render(<ProjectMetaRow project={{ ...baseProject, tags: [] }} />);

    // 参与回顾的项目总有下次回顾日（存量空值视为今天）。
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Next review');
    expect(buttons[0]).toHaveTextContent('Review due');
  });

  it('shows a due review in the accent colour, never deadline-red', () => {
    const { container } = render(
      <ProjectMetaRow project={{ ...baseProject, tags: [], nextReviewDate: '2000-01-01' }} />,
    );

    const badge = screen.getByRole('button', { name: 'Next review' });
    expect(badge).toHaveTextContent('Review due');
    expect(badge.querySelector('.text-primary')).not.toBeNull();
    expect(container.querySelector('.text-deadline')).toBeNull();
  });

  it('treats a stored ISO next review date of today as due', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T00:00:00.000Z`;
    render(<ProjectMetaRow project={{ ...baseProject, tags: [], nextReviewDate: iso }} />);

    expect(screen.getByRole('button', { name: 'Next review' })).toHaveTextContent('Review due');
  });

  it('shows the next review date in muted text before it is due', () => {
    render(<ProjectMetaRow project={{ ...baseProject, tags: [], nextReviewDate: '2999-01-02' }} />);

    const badge = screen.getByRole('button', { name: 'Next review' });
    expect(badge).not.toHaveTextContent('Review due');
    expect(badge.querySelector('.text-primary')).toBeNull();
    expect(badge).not.toHaveAttribute('title');
  });

  it('separates the deadline from the review badge with a divider', () => {
    const { container, rerender } = render(
      <ProjectMetaRow project={{ ...baseProject, dueDate: '2999-01-03T00:00:00.000Z' }} />,
    );
    expect(container.querySelector('.bg-border')).not.toBeNull();

    rerender(<ProjectMetaRow project={baseProject} />);
    expect(container.querySelector('.bg-border')).toBeNull();
  });

  it('hides the next review badge for projects that do not take part in review', () => {
    render(<ProjectMetaRow project={{ ...baseProject, tags: [], status: ProjectStatus.COMPLETED }} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not mark a past next review date as deadline-red', () => {
    const { container } = render(
      <ProjectMetaRow project={{ ...baseProject, nextReviewDate: '2000-01-01' }} />,
    );

    expect(screen.getByRole('button', { name: 'Next review' })).toBeInTheDocument();
    expect(container.querySelector('.text-deadline')).toBeNull();
  });

  it('opens the review picker from the next review badge', async () => {
    const user = userEvent.setup();
    render(<ProjectMetaRow project={{ ...baseProject, tags: [] }} />);

    await user.click(screen.getByRole('button', { name: 'Next review' }));

    expect(await screen.findByText('Review every')).toBeInTheDocument();
  });

  it('does not mark an overdue scheduled date as deadline-red（When 永不逾期）', () => {
    const project: ProjectResponseDto = {
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2000-01-01T00:00:00.000Z',
    };
    const { container } = render(<ProjectMetaRow project={project} />);

    expect(container.querySelector('.text-deadline')).toBeNull();
  });

  it('marks an overdue due date as deadline-red', () => {
    const project: ProjectResponseDto = {
      ...baseProject,
      dueDate: '2000-01-01T00:00:00.000Z',
    };
    const { container } = render(<ProjectMetaRow project={project} />);

    expect(container.querySelector('.text-deadline')).not.toBeNull();
  });

  it('opens the due date popover and commits a picked date', async () => {
    const user = userEvent.setup();
    render(
      <ProjectMetaRow
        project={{
          ...baseProject,
          scheduledType: ScheduledType.DATE,
          scheduledDate: '2999-01-02T00:00:00.000Z',
          dueDate: '2999-01-03T00:00:00.000Z',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Deadline' }));

    // 到期弹层现在是共享的日历组件：点 Today 快捷按钮即提交并关闭。
    const todayButton = await screen.findByRole('button', { name: 'Today' });
    await user.click(todayButton);

    await waitFor(() => {
      expect(mutationMocks.update).toHaveBeenCalledWith(
        {
          id: 'project-1',
          data: { dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
        },
        expect.anything(),
      );
    });
  });

  it('opens the tags popover and toggles a tag selection', async () => {
    const user = userEvent.setup();
    render(<ProjectMetaRow project={baseProject} />);

    await user.click(screen.getByRole('button', { name: 'Tags' }));
    // 选中未勾选的 urgent → 追加到已有 design 之后。
    await user.click(screen.getByRole('option', { name: 'urgent' }));
    await waitFor(() => {
      expect(mutationMocks.update).toHaveBeenCalledWith(
        { id: 'project-1', data: { tagIds: ['tag-a', 'tag-b'] } },
        expect.anything(),
      );
    });
  });

  it('shows a past scheduled date as Today with the yellow star（When 永不逾期）', () => {
    const { container } = render(
      <ProjectMetaRow
        project={{
          ...baseProject,
          scheduledType: ScheduledType.DATE,
          scheduledDate: '2000-01-01T00:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Scheduled date' })).toHaveTextContent('Today');
    expect(container.querySelector('.text-today')).not.toBeNull();
  });

  it('summarises the repeat rule on its badge', () => {
    render(
      <ProjectMetaRow
        project={{
          ...baseProject,
          scheduledType: ScheduledType.DATE,
          scheduledDate: '2999-01-02T00:00:00.000Z',
          repeatRule: { unit: 'week', interval: 2, anchor: 'scheduled' },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Repeat' })).toHaveTextContent('Every 2 weeks');
  });

  it('lists repeat weekdays after the interval', () => {
    render(
      <ProjectMetaRow
        project={{
          ...baseProject,
          scheduledType: ScheduledType.DATE,
          scheduledDate: '2999-01-02T00:00:00.000Z',
          repeatRule: { unit: 'week', interval: 1, weekdays: [3, 1], anchor: 'scheduled' },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Repeat' })).toHaveTextContent('Weekly · Mon, Wed');
  });
});
