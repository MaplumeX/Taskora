import { describe, expect, it } from 'vitest';

import type {
  AreaResponseDto,
  FeedItem,
  ProjectFeedItem,
  ProjectResponseDto,
  TaskFeedItem,
} from '@taskora/shared';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskBucket,
  TaskStatus,
} from '@taskora/shared';

import {
  deriveGroupedFeedLayout,
  type GroupedFeedLayout,
} from './groupedFeedLayout';

/** 紧凑的块序列摘要，便于断言「渲染块顺序」这一外部行为。 */
function blockSummary(layout: GroupedFeedLayout): string[] {
  return layout.blocks.map((block) => {
    switch (block.kind) {
      case 'task':
        return `task:${block.item.id}`;
      case 'projectRow':
        return `projectRow:${block.item.id}`;
      case 'projectGroupHeader':
        return `projectHeader:${block.project.id}`;
      case 'areaGroupHeader':
        return `areaHeader:${block.area.id}`;
    }
  });
}

// 仅让 fixture 的 sortOrder 互不相同；推导按 feed 数组顺序而非 sortOrder。
let feedPosition = 0;

function taskItem(
  id: string,
  opts: { projectId?: string | null; areaId?: string | null } = {},
): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledDate: null,
    scheduledType: ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.ANYTIME,
    completedAt: null,
    trashedAt: null,
    sortOrder: feedPosition++,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    tags: [],
    projectId: opts.projectId ?? null,
    headingId: null,
    areaId: opts.areaId ?? null,
  };
}

function projectItem(id: string, opts: { areaId?: string | null } = {}): ProjectFeedItem {
  return {
    id,
    type: 'project',
    title: id,
    notes: null,
    scheduledDate: '2026-08-01T00:00:00.000Z',
    scheduledType: ScheduledType.DATE,
    reminderTime: null,
    repeatRule: null,
    dueDate: null,
    status: ProjectStatus.ACTIVE,
    bucket: ProjectBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
    sortOrder: feedPosition++,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    tags: [],
    areaId: opts.areaId ?? null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
  };
}

function project(
  id: string,
  opts: {
    areaId?: string | null;
    status?: ProjectStatus;
    trashedAt?: string | null;
  } = {},
): ProjectResponseDto {
  return {
    id,
    title: id,
    notes: null,
    areaId: opts.areaId ?? null,
    sortOrder: 0,
    status: opts.status ?? ProjectStatus.ACTIVE,
    bucket: ProjectBucket.ANYTIME,
    scheduledType: ScheduledType.NONE,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: opts.trashedAt ?? null,
    tags: [],
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function area(id: string): AreaResponseDto {
  return {
    id,
    title: id,
    notes: null,
    sortOrder: 0,
    tags: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

interface DeriveOpts {
  projects?: ProjectResponseDto[];
  areas?: AreaResponseDto[];
  groupingEnabled?: boolean;
}

function derive(items: FeedItem[], opts: DeriveOpts = {}): GroupedFeedLayout {
  return deriveGroupedFeedLayout({
    items,
    projects: opts.projects ?? [],
    areas: opts.areas ?? [],
    groupingEnabled: opts.groupingEnabled ?? true,
  });
}

describe('grouped feed layout — membership（按直接父级聚类）', () => {
  it('tasks join their direct project; area-only tasks join the area; loose tasks stay ungrouped', () => {
    const layout = derive(
      [
        taskItem('loose'),
        taskItem('in-project', { projectId: 'p1' }),
        taskItem('in-area', { areaId: 'a1' }),
      ],
      { projects: [project('p1')], areas: [area('a1')] },
    );

    expect(blockSummary(layout)).toEqual([
      'task:loose',
      'projectHeader:p1',
      'task:in-project',
      'areaHeader:a1',
      'task:in-area',
    ]);
    const byId = new Map(
      layout.blocks
        .filter((b) => b.kind === 'task')
        .map((b) => [(b as { item: TaskFeedItem }).item.id, b]),
    );
    expect(byId.get('loose')).toMatchObject({ groupHeaderId: null });
    expect(byId.get('in-project')).toMatchObject({ groupHeaderId: 'p1' });
    expect(byId.get('in-area')).toMatchObject({ groupHeaderId: 'a1' });
  });

  it('a task inside an area-scoped project groups flatly under the project, not nested in the area', () => {
    const layout = derive([taskItem('t1', { projectId: 'p1', areaId: 'a1' })], {
      projects: [project('p1', { areaId: 'a1' })],
      areas: [area('a1')],
    });

    // 扁平单层：只有项目组头，不出现 area 组头，也不出现嵌套。
    expect(blockSummary(layout)).toEqual(['projectHeader:p1', 'task:t1']);
    const task = layout.blocks.find((b) => b.kind === 'task');
    expect(task).toMatchObject({ groupHeaderId: 'p1' });
  });
});

describe('grouped feed layout — block order（扁平单层，侧边栏全局顺序）', () => {
  it('orders ungrouped first, then flat groups in sidebar order (projects by their own Position)', () => {
    const layout = derive(
      [
        taskItem('loose-1'),
        taskItem('in-p2', { projectId: 'p2' }),
        taskItem('in-a1', { areaId: 'a1' }),
        taskItem('loose-2'),
        taskItem('in-p1', { projectId: 'p1' }),
      ],
      {
        // 侧边栏位次：p2 在 p1 之前（与数组顺序一致）；p 都在 a1 之前。
        projects: [project('p2'), project('p1')],
        areas: [area('a1')],
      },
    );

    expect(blockSummary(layout)).toEqual([
      'task:loose-1',
      'task:loose-2',
      'projectHeader:p2',
      'task:in-p2',
      'projectHeader:p1',
      'task:in-p1',
      'areaHeader:a1',
      'task:in-a1',
    ]);
  });

  it('places an area before its first in-area project (sidebar nesting preserved as flat order)', () => {
    const layout = derive(
      [
        taskItem('in-standalone', { projectId: 'p-standalone' }),
        taskItem('direct', { areaId: 'a1' }),
        taskItem('in-p1', { projectId: 'p1' }),
        taskItem('in-p2', { projectId: 'p2' }),
      ],
      {
        // 侧边栏：p-standalone 在前，随后 a1 及其下 p1、p2。
        projects: [
          project('p-standalone'),
          project('p1', { areaId: 'a1' }),
          project('p2', { areaId: 'a1' }),
        ],
        areas: [area('a1')],
      },
    );

    expect(blockSummary(layout)).toEqual([
      'projectHeader:p-standalone',
      'task:in-standalone',
      'areaHeader:a1',
      'task:direct',
      'projectHeader:p1',
      'task:in-p1',
      'projectHeader:p2',
      'task:in-p2',
    ]);
  });

  it('skips an area group with no direct tasks even when its projects have tasks', () => {
    const layout = derive(
      [taskItem('in-p1', { projectId: 'p1' }), taskItem('in-p2', { projectId: 'p2' })],
      {
        projects: [project('p1', { areaId: 'a1' }), project('p2', { areaId: 'a1' })],
        areas: [area('a1')],
      },
    );

    // a1 无直属任务 → 无 area 组头；p1/p2 保持侧边栏相对顺序。
    expect(blockSummary(layout)).toEqual([
      'projectHeader:p1',
      'task:in-p1',
      'projectHeader:p2',
      'task:in-p2',
    ]);
  });

  it('interleaves multiple areas and projects by the sidebar global order', () => {
    const layout = derive(
      [
        taskItem('in-a2', { areaId: 'a2' }),
        taskItem('in-p1', { projectId: 'p1' }),
        taskItem('in-a1', { areaId: 'a1' }),
        taskItem('in-p2', { projectId: 'p2' }),
      ],
      {
        // 侧边栏：a1 及其下 p1 → p2 → a2。
        projects: [project('p1', { areaId: 'a1' }), project('p2')],
        areas: [area('a1'), area('a2')],
      },
    );

    expect(blockSummary(layout)).toEqual([
      'areaHeader:a1',
      'task:in-a1',
      'projectHeader:p1',
      'task:in-p1',
      'projectHeader:p2',
      'task:in-p2',
      'areaHeader:a2',
      'task:in-a2',
    ]);
  });

  it('keeps the feed (global Position) order of tasks within each group', () => {
    // feed 顺序与项目数组顺序无关：组内任务保留进入视图时的先后。
    const layout = derive(
      [
        taskItem('second', { projectId: 'p1' }),
        taskItem('first-ish', { projectId: 'p1' }),
        taskItem('third', { projectId: 'p1' }),
      ],
      { projects: [project('p1')] },
    );

    expect(blockSummary(layout)).toEqual([
      'projectHeader:p1',
      'task:second',
      'task:first-ish',
      'task:third',
    ]);
  });
});

describe('grouped feed layout — group visibility（组头可见性）', () => {
  it('renders no header for parents without visible tasks', () => {
    const layout = derive([taskItem('loose')], {
      projects: [project('p-empty')],
      areas: [area('a-empty')],
    });

    expect(blockSummary(layout)).toEqual(['task:loose']);
  });

  it('headers carry their view task ids (no counts, no collapse state)', () => {
    const layout = derive(
      [taskItem('t1', { projectId: 'p1' }), taskItem('t2', { projectId: 'p1' })],
      { projects: [project('p1')] },
    );

    const header = layout.blocks[0];
    expect(header).toMatchObject({ kind: 'projectGroupHeader', taskIds: ['t1', 't2'] });
    expect(header).not.toHaveProperty('collapsed');
    expect(header).not.toHaveProperty('directTaskCount');
  });
});

describe('grouped feed layout — standalone project row fallback（独立项目行回退）', () => {
  it('keeps a date-matching project with zero visible tasks as a standalone row in merged feed order', () => {
    const layout = derive(
      [taskItem('loose-1'), projectItem('p-due'), taskItem('loose-2')],
      { projects: [project('p-due')] },
    );

    expect(blockSummary(layout)).toEqual(['task:loose-1', 'projectRow:p-due', 'task:loose-2']);
  });

  it('absorbs the project feed row into the group header when the project has visible tasks', () => {
    const layout = derive(
      [projectItem('p1'), taskItem('in-p1', { projectId: 'p1' })],
      { projects: [project('p1')] },
    );

    // 不出现独立项目行；组头按侧边栏位次出现（项目行被组头取代）。
    expect(blockSummary(layout)).toEqual(['projectHeader:p1', 'task:in-p1']);
  });

  it('keeps a settled/trashed project feed row standalone (never a group header)', () => {
    const layout = derive([projectItem('p-done')], {
      projects: [project('p-done', { status: ProjectStatus.COMPLETED })],
    });

    expect(blockSummary(layout)).toEqual(['projectRow:p-done']);
  });
});

describe('grouped feed layout — orphan tasks（孤儿任务）', () => {
  it('renders tasks under a settled project as ungrouped', () => {
    const layout = derive([taskItem('orphan', { projectId: 'p-done' })], {
      projects: [project('p-done', { status: ProjectStatus.COMPLETED })],
    });

    expect(blockSummary(layout)).toEqual(['task:orphan']);
    expect(layout.blocks[0]).toMatchObject({ groupHeaderId: null });
  });

  it('renders tasks of a settled in-area project as ungrouped (no area fall-through)', () => {
    // spec Rule 5：父项目已了结/已丢弃的任务是孤儿，浮于未分组区，
    // 不因任务自身的 areaId 落进 Area 组（行上保留项目标题标签）。
    const layout = derive(
      [taskItem('orphan', { projectId: 'p-done', areaId: 'a1' })],
      {
        projects: [project('p-done', { areaId: 'a1', status: ProjectStatus.COMPLETED })],
        areas: [area('a1')],
      },
    );

    expect(blockSummary(layout)).toEqual(['task:orphan']);
    expect(layout.blocks[0]).toMatchObject({ groupHeaderId: null });
  });

  it('renders tasks of a trashed in-area project as ungrouped (no area fall-through)', () => {
    const layout = derive(
      [taskItem('orphan', { projectId: 'p-trashed', areaId: 'a1' })],
      {
        projects: [
          project('p-trashed', { areaId: 'a1', trashedAt: '2026-08-01T00:00:00.000Z' }),
        ],
        areas: [area('a1')],
      },
    );

    expect(blockSummary(layout)).toEqual(['task:orphan']);
  });

  it('renders tasks under a trashed project as ungrouped', () => {
    const layout = derive([taskItem('orphan', { projectId: 'p-trashed' })], {
      projects: [project('p-trashed', { trashedAt: '2026-08-01T00:00:00.000Z' })],
    });

    expect(blockSummary(layout)).toEqual(['task:orphan']);
  });

  it('renders tasks referencing a missing project or area as ungrouped', () => {
    const layout = derive([
      taskItem('no-project', { projectId: 'ghost-p' }),
      taskItem('no-area', { areaId: 'ghost-a' }),
    ]);

    expect(blockSummary(layout)).toEqual(['task:no-project', 'task:no-area']);
    layout.blocks.forEach((block) => expect(block).toMatchObject({ groupHeaderId: null }));
  });
});

describe('grouped feed layout — toggle off（开关关闭恒等）', () => {
  it('is the identity over the flat feed when grouping is disabled', () => {
    const items: FeedItem[] = [
      taskItem('t1', { projectId: 'p1' }),
      projectItem('p1'),
      taskItem('t2'),
    ];
    const layout = derive(items, {
      projects: [project('p1')],
      groupingEnabled: false,
    });

    expect(blockSummary(layout)).toEqual(['task:t1', 'projectRow:p1', 'task:t2']);
    expect(layout.taskOrder).toEqual(['t1', 't2']);
  });
});

describe('grouped feed layout — taskOrder（视图任务序）', () => {
  it('lists every view task in grouped order', () => {
    const layout = derive(
      [
        taskItem('loose'),
        taskItem('in-p1', { projectId: 'p1' }),
        taskItem('direct', { areaId: 'a1' }),
      ],
      {
        projects: [project('p1')],
        areas: [area('a1')],
      },
    );

    expect(layout.taskOrder).toEqual(['loose', 'in-p1', 'direct']);
  });
});
