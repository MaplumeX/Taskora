import { describe, expect, it } from 'vitest';

import type { ProjectResponseDto } from '@taskora/shared';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';

import {
  SIDEBAR_DROP_REGION_ID,
  parseSidebarDropId,
  planSidebarDrop,
  projectOrderLastInArea,
  taskOrderLastInProject,
  sidebarDropAccepts,
  sidebarDropId,
  type DropTask,
  type SidebarDropTarget,
} from './sidebarDrop';

const TODAY = '2026-10-07';
const NOW = '2026-10-01T00:00:00.000Z';

function task(id: string, fields: Partial<DropTask> = {}): DropTask {
  return {
    id,
    projectId: null,
    areaId: null,
    bucket: TaskBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    status: TaskStatus.ACTIVE,
    ...fields,
  };
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
    ...fields,
  };
}

const tasks = (...list: DropTask[]) => ({ kind: 'tasks' as const, tasks: list });
const proj = (p: ProjectResponseDto) => ({ kind: 'project' as const, project: p });

describe('sidebar drop ids', () => {
  it.each<SidebarDropTarget>([
    { kind: 'inbox' },
    { kind: 'today' },
    { kind: 'upcoming' },
    { kind: 'anytime' },
    { kind: 'someday' },
    { kind: 'logbook' },
    { kind: 'trash' },
    { kind: 'area', areaId: 'a1' },
    { kind: 'project', projectId: 'p1' },
  ])('round-trips %o', (target) => {
    expect(parseSidebarDropId(sidebarDropId(target))).toEqual(target);
  });

  it('does not parse the region or foreign ids as targets', () => {
    expect(parseSidebarDropId(SIDEBAR_DROP_REGION_ID)).toBeNull();
    expect(parseSidebarDropId('task:t1')).toBeNull();
    expect(parseSidebarDropId('proj:p1')).toBeNull();
    expect(parseSidebarDropId('sidebar-drop:calendar')).toBeNull();
  });
});

describe('sidebarDropAccepts', () => {
  it.each([
    ['inbox', true, false],
    ['today', true, true],
    ['upcoming', true, true],
    ['anytime', true, true],
    ['someday', true, true],
    ['logbook', true, true],
    ['trash', true, true],
    ['area', true, true],
    ['project', true, false],
  ] as const)('%s: tasks=%s project=%s', (kind, forTasks, forProject) => {
    expect(sidebarDropAccepts('tasks', kind)).toBe(forTasks);
    expect(sidebarDropAccepts('project', kind)).toBe(forProject);
  });
});

describe('planSidebarDrop: tasks', () => {
  it.each<[string, SidebarDropTarget, unknown]>([
    [
      'Inbox clears owner and schedule (deadline untouched)',
      { kind: 'inbox' },
      {
        type: 'updateTask',
        id: 't1',
        data: {
          projectId: null,
          areaId: null,
          bucket: TaskBucket.INBOX,
          scheduledType: ScheduledType.NONE,
        },
      },
    ],
    [
      'Today schedules for today',
      { kind: 'today' },
      {
        type: 'updateTask',
        id: 't1',
        data: { scheduledType: ScheduledType.DATE, scheduledDate: TODAY },
      },
    ],
    [
      'Someday parks it',
      { kind: 'someday' },
      { type: 'updateTask', id: 't1', data: { scheduledType: ScheduledType.SOMEDAY } },
    ],
    [
      'Anytime clears the schedule',
      { kind: 'anytime' },
      {
        type: 'updateTask',
        id: 't1',
        data: {
          scheduledType: ScheduledType.NONE,
          scheduledDate: null,
          bucket: TaskBucket.ANYTIME,
        },
      },
    ],
    ['Upcoming asks for a date', { kind: 'upcoming' }, { type: 'pickTaskSchedule', ids: ['t1'] }],
    ['Logbook completes', { kind: 'logbook' }, { type: 'completeTask', id: 't1' }],
    ['Trash deletes', { kind: 'trash' }, { type: 'deleteTask', id: 't1' }],
    [
      'area moves to the area',
      { kind: 'area', areaId: 'a1' },
      { type: 'updateTask', id: 't1', data: { projectId: null, areaId: 'a1' } },
    ],
    [
      'project moves to the project',
      { kind: 'project', projectId: 'p1' },
      { type: 'updateTask', id: 't1', data: { projectId: 'p1', areaId: null } },
    ],
  ])('%s', (_name, target, action) => {
    const source = task('t1', {
      projectId: 'p-other',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-20',
    });
    expect(planSidebarDrop(tasks(source), target, TODAY)).toEqual([action]);
  });

  it.each<[string, DropTask, SidebarDropTarget]>([
    ['already in Inbox', task('t1', { bucket: TaskBucket.INBOX }), { kind: 'inbox' }],
    [
      'already scheduled today',
      task('t1', { scheduledType: ScheduledType.DATE, scheduledDate: TODAY }),
      { kind: 'today' },
    ],
    ['already Someday', task('t1', { scheduledType: ScheduledType.SOMEDAY }), { kind: 'someday' }],
    ['already in Anytime', task('t1'), { kind: 'anytime' }],
    ['already completed', task('t1', { status: TaskStatus.COMPLETED }), { kind: 'logbook' }],
    ['already cancelled', task('t1', { status: TaskStatus.CANCELLED }), { kind: 'logbook' }],
    ['already in the area', task('t1', { areaId: 'a1' }), { kind: 'area', areaId: 'a1' }],
    [
      'already in the project',
      task('t1', { projectId: 'p1' }),
      { kind: 'project', projectId: 'p1' },
    ],
  ])('skips a task %s', (_name, source, target) => {
    expect(planSidebarDrop(tasks(source), target, TODAY)).toEqual([]);
  });

  it('takes an Inbox task to Anytime', () => {
    const source = task('t1', { bucket: TaskBucket.INBOX });
    expect(planSidebarDrop(tasks(source), { kind: 'anytime' }, TODAY)).toEqual([
      {
        type: 'updateTask',
        id: 't1',
        data: {
          scheduledType: ScheduledType.NONE,
          scheduledDate: null,
          bucket: TaskBucket.ANYTIME,
        },
      },
    ]);
  });

  it('asks for one date for the whole group on Upcoming', () => {
    const group = tasks(task('t1'), task('t2', { scheduledType: ScheduledType.SOMEDAY }));
    expect(planSidebarDrop(group, { kind: 'upcoming' }, TODAY)).toEqual([
      { type: 'pickTaskSchedule', ids: ['t1', 't2'] },
    ]);
  });

  it('reschedules an overdue task to today', () => {
    const source = task('t1', { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-01' });
    expect(planSidebarDrop(tasks(source), { kind: 'today' }, TODAY)).toHaveLength(1);
  });

  it('moves a task in a project of the area to the area itself', () => {
    const source = task('t1', { projectId: 'p1', areaId: null });
    expect(planSidebarDrop(tasks(source), { kind: 'area', areaId: 'a1' }, TODAY)).toEqual([
      { type: 'updateTask', id: 't1', data: { projectId: null, areaId: 'a1' } },
    ]);
  });

  it('applies to a group in order, skipping members already at the target', () => {
    const group = tasks(task('t1'), task('t2', { projectId: 'p1' }), task('t3', { areaId: 'a1' }));
    expect(planSidebarDrop(group, { kind: 'project', projectId: 'p1' }, TODAY)).toEqual([
      { type: 'updateTask', id: 't1', data: { projectId: 'p1', areaId: null } },
      { type: 'updateTask', id: 't3', data: { projectId: 'p1', areaId: null } },
    ]);
  });

  it('completes only the open members of a group', () => {
    const group = tasks(task('t1'), task('t2', { status: TaskStatus.COMPLETED }), task('t3'));
    expect(planSidebarDrop(group, { kind: 'logbook' }, TODAY)).toEqual([
      { type: 'completeTask', id: 't1' },
      { type: 'completeTask', id: 't3' },
    ]);
  });
});

describe('planSidebarDrop: project', () => {
  it.each<[string, SidebarDropTarget, unknown]>([
    [
      'area re-files the project',
      { kind: 'area', areaId: 'a2' },
      { type: 'moveProjectToArea', id: 'p1', areaId: 'a2' },
    ],
    [
      'Today schedules the project for today',
      { kind: 'today' },
      {
        type: 'updateProject',
        id: 'p1',
        data: { scheduledType: ScheduledType.DATE, scheduledDate: TODAY },
      },
    ],
    [
      'Someday makes it a Later Project',
      { kind: 'someday' },
      { type: 'updateProject', id: 'p1', data: { scheduledType: ScheduledType.SOMEDAY } },
    ],
    ['Upcoming asks for a date', { kind: 'upcoming' }, { type: 'pickProjectSchedule', id: 'p1' }],
    [
      'Anytime clears the schedule',
      { kind: 'anytime' },
      {
        type: 'updateProject',
        id: 'p1',
        data: { scheduledType: ScheduledType.NONE, scheduledDate: null },
      },
    ],
    ['Logbook completes', { kind: 'logbook' }, { type: 'completeProject', id: 'p1' }],
    ['Trash deletes', { kind: 'trash' }, { type: 'deleteProject', id: 'p1' }],
  ])('%s', (_name, target, action) => {
    const source = project('p1', {
      areaId: 'a1',
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2026-10-20',
    });
    expect(planSidebarDrop(proj(source), target, TODAY)).toEqual([action]);
  });

  it.each<SidebarDropTarget>([{ kind: 'inbox' }, { kind: 'project', projectId: 'p2' }])(
    'rejects %o',
    (target) => {
      expect(planSidebarDrop(proj(project('p1')), target, TODAY)).toBeNull();
    },
  );

  it.each<[string, Partial<ProjectResponseDto>, SidebarDropTarget]>([
    ['already in the area', { areaId: 'a1' }, { kind: 'area', areaId: 'a1' }],
    [
      'already scheduled today',
      { scheduledType: ScheduledType.DATE, scheduledDate: TODAY },
      { kind: 'today' },
    ],
    ['already Someday', { scheduledType: ScheduledType.SOMEDAY }, { kind: 'someday' }],
    ['already unscheduled', {}, { kind: 'anytime' }],
    ['already completed', { status: ProjectStatus.COMPLETED }, { kind: 'logbook' }],
  ])('skips a project %s', (_name, fields, target) => {
    expect(planSidebarDrop(proj(project('p1', fields)), target, TODAY)).toEqual([]);
  });
});

describe('projectOrderLastInArea', () => {
  const all = [
    project('p1', { position: 'a' }),
    project('p2', { areaId: 'a1', position: 'b' }),
    project('p3', { areaId: 'a1', position: 'c' }),
    project('p4', { areaId: 'a2', position: 'd' }),
  ];

  it('puts the project right after the last project of the area', () => {
    expect(projectOrderLastInArea(all, 'p4', 'a1')).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(projectOrderLastInArea(all, 'p1', 'a1')).toEqual(['p2', 'p3', 'p1', 'p4']);
  });

  it('returns null when the area has no other project (order is irrelevant)', () => {
    expect(projectOrderLastInArea(all, 'p1', 'a-empty')).toBeNull();
  });
});

describe('taskOrderLastInProject', () => {
  const row = (id: string, position: string, headingId: string | null = null) => ({
    id,
    position,
    headingId,
  });

  it('puts moved tasks after the project’s tasks without a heading, in drop order', () => {
    const projectTasks = [
      row('m2', 'a'),
      row('u1', 'b'),
      row('h1', 'c', 'heading-1'),
      row('m1', 'd'),
      row('u2', 'e'),
    ];
    expect(taskOrderLastInProject(projectTasks, ['m1', 'm2'])).toEqual(['u1', 'u2', 'm1', 'm2']);
  });

  it('returns null when nothing else is in the section', () => {
    expect(taskOrderLastInProject([row('m1', 'a'), row('h1', 'b', 'x')], ['m1'])).toBeNull();
  });
});
