import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  useTagsQuery: () => ({
    data: [tagA, tagB].map((t) => ({ ...t })),
  }),
}));

const tagA: TagResponseDto = {
  id: 'tag-a',
  title: 'design',
  color: '#3B82F6',
  sortOrder: 0,
  tagGroupId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const tagB: TagResponseDto = {
  id: 'tag-b',
  title: 'urgent',
  color: '#EF4444',
  sortOrder: 1,
  tagGroupId: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const baseProject: ProjectResponseDto = {
  id: 'project-1',
  title: 'Website Redesign',
  notes: null,
  areaId: null,
  sortOrder: 0,
  status: ProjectStatus.ACTIVE,
  bucket: ProjectBucket.INBOX,
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

  it('renders scheduled and due badges when set, plus tag dots', () => {
    const project: ProjectResponseDto = {
      ...baseProject,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2999-01-02T00:00:00.000Z',
      dueDate: '2999-01-03T00:00:00.000Z',
    };
    render(<ProjectMetaRow project={project} />);

    // 日期徽章触发器携带格式化后的日期文字（非空 textContent）。
    const buttons = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '');
    expect(buttons.some((text) => text.trim() !== '')).toBe(true);
    // 标签色点渲染（title 提示携带标签名）。
    expect(screen.getByTitle('design')).toBeInTheDocument();
  });

  it('renders nothing when no metadata is set', () => {
    const { container } = render(
      <ProjectMetaRow project={{ ...baseProject, tags: [] }} />,
    );

    // 无任何元数据时不渲染按钮。
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('marks an overdue due date as destructive', () => {
    const project: ProjectResponseDto = {
      ...baseProject,
      dueDate: '2000-01-01T00:00:00.000Z',
    };
    const { container } = render(<ProjectMetaRow project={project} />);

    expect(container.querySelector('.text-destructive')).not.toBeNull();
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

    // 截止日期触发器为携带日期文字的第二个按钮。
    const dateTriggers = screen.getAllByRole('button');
    await user.click(dateTriggers[1]);

    const input = document.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: '2999-01-05' } });

    await waitFor(() => {
      expect(mutationMocks.update).toHaveBeenCalledWith(
        {
          id: 'project-1',
          data: { dueDate: expect.stringMatching(/^2999-01-0\dT/) },
        },
        expect.anything(),
      );
    });
  });

  it('opens the tags popover and toggles a tag selection', async () => {
    const user = userEvent.setup();
    render(<ProjectMetaRow project={baseProject} />);

    // 标签触发器携带色点（带 title 提示）。
    const tagTrigger = screen.getByTitle('design').closest('button');
    expect(tagTrigger).not.toBeNull();
    await user.click(tagTrigger!);
    // 选中未勾选的 urgent → 追加到已有 design 之后。
    await user.click(screen.getByRole('button', { name: 'urgent' }));
    await waitFor(() => {
      expect(mutationMocks.update).toHaveBeenCalledWith(
        { id: 'project-1', data: { tagIds: ['tag-a', 'tag-b'] } },
        expect.anything(),
      );
    });
  });
});
