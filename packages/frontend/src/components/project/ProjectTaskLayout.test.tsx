import { describe, expect, it } from 'vitest';
import type { ProjectHeadingResponseDto, TaskResponseDto } from '@taskora/shared';
import { HeadingStatus, ScheduledType, TaskBucket, TaskStatus } from '@taskora/shared';
import {
  applyLayoutDrag,
  normalizeLayout,
  serializeLayout,
  type LayoutState,
} from './ProjectTaskLayout';

const heading: ProjectHeadingResponseDto = {
  id: 'heading-1',
  projectId: 'project-1',
  title: 'Build',
  sortOrder: 0,
  status: HeadingStatus.ACTIVE,
  completedAt: null,
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

function task(
  id: string,
  headingId: string | null,
): TaskResponseDto {
  return {
    id,
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    dueDate: null,
    bucket: TaskBucket.ANYTIME,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    trashedAt: null,
    sortOrder: 0,
    projectId: 'project-1',
    headingId,
    areaId: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

describe('project task layout normalization', () => {
  it('keeps ungrouped tasks first and preserves empty headings', () => {
    const layout = normalizeLayout(
      [
        task('ungrouped', null),
        task('grouped', 'heading-1'),
      ],
      [heading],
    );

    expect(layout.headingIds).toEqual(['heading-1']);
    expect(layout.containers).toEqual({
      ungrouped: ['ungrouped'],
      'heading-1': ['grouped'],
    });
    expect(serializeLayout('project-1', layout)).toEqual({
      projectId: 'project-1',
      ungroupedTaskIds: ['ungrouped'],
      groups: [{ headingId: 'heading-1', taskIds: ['grouped'] }],
    });
  });

  it('falls back to ungrouped when a task references a missing heading', () => {
    expect(normalizeLayout([task('legacy', 'missing')], [heading]).containers.ungrouped).toEqual([
      'legacy',
    ]);
  });
});

describe('project task layout drag serialization', () => {
  const layout: LayoutState = {
    headingIds: ['heading-1', 'heading-2'],
    containers: {
      ungrouped: ['task-u1', 'task-u2'],
      'heading-1': ['task-a', 'task-b'],
      'heading-2': [],
    },
  };

  it('reorders tasks within the ungrouped container', () => {
    const next = applyLayoutDrag(layout, 'task:task-u2', 'task:task-u1');

    expect(next?.containers.ungrouped).toEqual(['task-u2', 'task-u1']);
    expect(layout.containers.ungrouped).toEqual(['task-u1', 'task-u2']);
  });

  it('moves a task across containers at the hovered task position', () => {
    const next = applyLayoutDrag(layout, 'task:task-u1', 'task:task-b');

    expect(next?.containers.ungrouped).toEqual(['task-u2']);
    expect(next?.containers['heading-1']).toEqual(['task-a', 'task-u1', 'task-b']);
  });

  it('moves a task into an empty heading drop zone', () => {
    const next = applyLayoutDrag(layout, 'task:task-a', 'container:heading-2');

    expect(next?.containers['heading-1']).toEqual(['task-b']);
    expect(next?.containers['heading-2']).toEqual(['task-a']);
    expect(serializeLayout('project-1', next!)).toEqual({
      projectId: 'project-1',
      ungroupedTaskIds: ['task-u1', 'task-u2'],
      groups: [
        { headingId: 'heading-1', taskIds: ['task-b'] },
        { headingId: 'heading-2', taskIds: ['task-a'] },
      ],
    });
  });

  it('reorders a whole heading block when dropped over one of its tasks', () => {
    const next = applyLayoutDrag(layout, 'heading:heading-2', 'task:task-a');

    expect(next?.headingIds).toEqual(['heading-2', 'heading-1']);
    expect(next?.containers).toEqual(layout.containers);
  });
});
