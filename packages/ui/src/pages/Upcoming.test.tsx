import type { ReactNode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
  DragStartEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useFeedQuery,
  useMultiSelectStore,
  usePreferencesStore,
  useSelectionStore,
  useUiInteractionStore,
  type DayCalendarEvent,
  type RepeatPreview,
} from '@taskora/api';
import {
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type FeedItem,
  type TaskFeedItem,
} from '@taskora/shared';

import Upcoming from './Upcoming';
import { AppDndProvider } from '../lib/appDnd';

interface DndHandlers {
  collisionDetection: CollisionDetection;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
}

const harness = vi.hoisted(() => ({
  dnd: null as DndHandlers | null,
  update: vi.fn(),
  reorder: vi.fn(),
  error: vi.fn(),
  previews: [] as RepeatPreview[],
  events: new Map<string, DayCalendarEvent[]>(),
  draggable: new Map<string, { draggable: boolean; droppable: boolean }>(),
  pointerIds: [] as string[],
  useGeometry: false,
  sidebarDrop: vi.fn(),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => ({
  ...(await importOriginal()),
  DndContext: (props: DndHandlers & { children: ReactNode }) => {
    // React 生成组件栈（如 act 警告）时会无参调用祖先组件，忽略那次调用。
    if (props) harness.dnd = props;
    return <div>{props.children}</div>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => (
    <div data-testid="overlay">{children}</div>
  ),
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
  pointerWithin: ({
    droppableContainers,
    droppableRects,
    pointerCoordinates,
  }: {
    droppableContainers: Array<{ id: string }>;
    droppableRects: Map<string, { top: number; height: number; left: number; width: number }>;
    pointerCoordinates: { x: number; y: number };
  }) =>
    droppableContainers
      .filter(({ id }) => {
        if (!harness.useGeometry) return harness.pointerIds.includes(id);
        const rect = droppableRects.get(id);
        return (
          rect &&
          pointerCoordinates.y >= rect.top &&
          pointerCoordinates.y <= rect.top + rect.height &&
          pointerCoordinates.x >= rect.left &&
          pointerCoordinates.x <= rect.left + rect.width
        );
      })
      .map(({ id }) => ({ id })),
}));

vi.mock('@dnd-kit/sortable', async (importOriginal) => ({
  ...(await importOriginal()),
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: ({
    id,
    disabled,
  }: {
    id: string;
    disabled: { draggable: boolean; droppable: boolean };
  }) => {
    harness.draggable.set(id, disabled);
    return { setNodeRef: () => undefined, attributes: {}, listeners: {} };
  },
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeedQuery: vi.fn(),
  useProjectsQuery: () => ({ data: [] }),
  useAreasQuery: () => ({ data: [] }),
  useTagsQuery: () => ({ data: [] }),
  useEffectiveTags: () => ({ ofFeedItem: () => [] }),
  useRepeatPreviews: () => harness.previews,
  useCalendarEvents: () => harness.events,
  useUpdateTask: () => ({ mutate: harness.update }),
  useReorderFeed: () => ({ mutate: harness.reorder }),
  useCompleteTask: () => ({ mutate: vi.fn() }),
  useUncompleteTask: () => ({ mutate: vi.fn() }),
  useUncancelTask: () => ({ mutate: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: harness.error } }));
vi.mock('@/components/feed/FeedItemRow', () => ({
  FeedItemRow: ({ item, showScheduledBadge }: { item: FeedItem; showScheduledBadge?: boolean }) => (
    <div data-testid={`row-${item.id}`} data-date={item.scheduledDate}>
      {item.title}
      {showScheduledBadge && (
        <span data-testid={`schedule-badge-${item.id}`}>{item.scheduledDate}</span>
      )}
    </div>
  ),
}));

function task(
  id: string,
  scheduledDate: string,
  overrides: Partial<TaskFeedItem> = {},
): TaskFeedItem {
  return {
    id,
    type: 'task',
    title: id,
    notes: null,
    scheduledType: ScheduledType.DATE,
    scheduledDate,
    reminderTime: '09:30',
    repeatRule: { unit: 'day', interval: 1, anchor: 'scheduled' },
    repeatSourceId: null,
    dueDate: '2026-12-31',
    status: TaskStatus.ACTIVE,
    bucket: TaskBucket.SCHEDULED,
    completedAt: null,
    trashedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    tags: [],
    projectId: 'project-1',
    headingId: 'heading-1',
    areaId: null,
    ...overrides,
  };
}

function eventEntry(
  id: string,
  title: string,
  dateKey: string,
  startTime: string | null,
): DayCalendarEvent {
  return {
    event: {
      id,
      subscriptionId: 's',
      color: 'blue',
      title,
      location: null,
      allDay: false,
      start: `${dateKey}T02:00:00Z`,
      end: `${dateKey}T03:00:00Z`,
    },
    dateKey,
    allDay: startTime === null,
    startTime,
    endTime: null,
    endsAt: Date.parse(`${dateKey}T03:00:00Z`),
  };
}

function renderUpcoming(items: FeedItem[]) {
  vi.mocked(useFeedQuery).mockReturnValue({
    data: items,
    isLoading: false,
    isError: false,
  } as never);
  return render(
    <MemoryRouter>
      <Upcoming />
    </MemoryRouter>,
    // 列表登记在应用壳的共享拖拽上下文里（ADR 0018）。
    {
      wrapper: ({ children }) => (
        <AppDndProvider onSidebarDrop={harness.sidebarDrop}>{children}</AppDndProvider>
      ),
    },
  );
}

function handlers() {
  if (!harness.dnd) throw new Error('Missing DndContext');
  return harness.dnd;
}

function start(id = 'task-1') {
  act(() => handlers().onDragStart({ active: { id: `task:${id}` } } as DragStartEvent));
}

function targetKey(target: string) {
  return /^(date|month):/.test(target) ? `container:${target}` : target;
}

function over(target: string, id = 'task-1') {
  act(() =>
    handlers().onDragOver({
      active: { id: `task:${id}` },
      over: { id: targetKey(target) },
    } as DragOverEvent),
  );
}

function end(target: string | null, id = 'task-1') {
  act(() =>
    handlers().onDragEnd({
      active: { id: `task:${id}` },
      over: target ? { id: targetKey(target) } : null,
    } as DragEndEvent),
  );
}

function taskGroup(id = 'task-1') {
  return document
    .querySelector(`[data-sortable-task-id="${id}"]`)
    ?.closest('[data-schedule-dropzone]')
    ?.getAttribute('data-schedule-dropzone');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T04:00:00Z'));
  vi.clearAllMocks();
  harness.draggable.clear();
  harness.previews = [];
  harness.events = new Map();
  harness.pointerIds = [];
  harness.useGeometry = false;
  usePreferencesStore.setState({ timeZone: 'Asia/Shanghai', legacyDateTimeZone: 'Asia/Shanghai' });
  useSelectionStore.setState({ selectedIds: [] });
  useUiInteractionStore.setState({ expandedId: null });
  useMultiSelectStore.setState({ active: false, ids: [] });
});

afterEach(() => vi.useRealTimers());

describe('Upcoming — 复用分组列表拖动来改计划日期', () => {
  it('拖入空日期时实时移动占位，松手才保存，且只提交计划字段', () => {
    renderUpcoming([task('task-1', '2026-10-07')]);
    start();
    over('date:2026-10-09');
    expect(taskGroup()).toBe('date:2026-10-09');
    expect(screen.getByTestId('task-placeholder-task-1')).toHaveClass('invisible');
    expect(harness.update).not.toHaveBeenCalled();
    end('date:2026-10-09');
    expect(taskGroup()).toBe('date:2026-10-09');
    expect(screen.queryByTestId('task-placeholder-task-1')).not.toBeInTheDocument();
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update).toHaveBeenCalledWith(
      {
        id: 'task-1',
        data: { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-09' },
      },
      expect.anything(),
    );
  });

  it.each([
    ['month:2026-10', '2026-10-14'],
    ['month:2026-11', '2026-11-01'],
  ])('拖入 %s，设为该分组第一天 %s', (target, date) => {
    renderUpcoming([task('task-1', '2026-10-07')]);
    start();
    over(target);
    end(target);
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe(date);
    expect(taskGroup()).toBe(target);
  });

  it('跨年月份使用目标年份的第一天', () => {
    vi.setSystemTime(new Date('2026-11-26T04:00:00Z'));
    renderUpcoming([task('task-1', '2026-11-27')]);
    start();
    end('month:2027-01');
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2027-01-01');
  });

  it('月份内拖动保留具体日号；跨组后返回原月份也恢复原日期', () => {
    renderUpcoming([task('task-1', '2026-11-15')]);
    start();
    over('month:2026-12');
    over('month:2026-11');
    end('month:2026-11');
    expect(harness.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-task-1')).toHaveAttribute('data-date', '2026-11-15');
  });

  it('取消拖动会撤销预览，不写入日期', () => {
    renderUpcoming([task('task-1', '2026-10-07')]);
    start();
    over('month:2026-11');
    act(() => handlers().onDragCancel());
    expect(taskGroup()).toBe('date:2026-10-07');
    expect(harness.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('overlay')).toBeEmptyDOMElement();
  });

  it('在区域外松手沿用现有逻辑，落在最后的有效预览处', () => {
    renderUpcoming([task('task-1', '2026-10-07')]);
    start();
    over('date:2026-10-10');
    end(null);
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-10-10');
  });

  it('没有有效落点时不改日期，保存失败时恢复原分组并提示', () => {
    renderUpcoming([task('task-1', '2026-10-07')]);
    start();
    end(null);
    expect(harness.update).not.toHaveBeenCalled();
    start();
    end('date:2026-10-10');
    act(() => harness.update.mock.calls[0][1].onError());
    expect(taskGroup()).toBe('date:2026-10-07');
    expect(harness.error).toHaveBeenCalledTimes(1);
  });

  it('展开中的编辑卡片与多选模式禁用拖动', () => {
    useUiInteractionStore.setState({ expandedId: 'task-1' });
    renderUpcoming([task('task-1', '2026-10-07'), task('task-2', '2026-10-08')]);
    expect(harness.draggable.get('task:task-1')?.draggable).toBe(true);
    expect(harness.draggable.get('task:task-2')?.draggable).toBe(false);
    act(() => useMultiSelectStore.setState({ active: true }));
    expect(harness.draggable.get('task:task-2')?.draggable).toBe(true);
  });

  it('重复预告不注册为可拖动任务，所有空分组仍保留放置区域', () => {
    harness.previews = [
      {
        sourceTaskId: 'preview',
        title: '下次预告',
        dateKey: '2026-10-08',
        projectId: null,
        areaId: null,
      },
    ];
    renderUpcoming([task('task-1', '2026-10-07')]);
    expect(screen.getByText('下次预告')).toBeInTheDocument();
    expect([...harness.draggable.keys()]).toEqual(['task:task-1']);
    expect(document.querySelectorAll('[data-schedule-dropzone]')).toHaveLength(10);
  });

  it('日程只读显示在当天分组的任务之前，不注册为可拖动任务', () => {
    harness.events = new Map([['2026-10-07', [eventEntry('evt', '评审会', '2026-10-07', '10:00')]]]);
    renderUpcoming([task('task-1', '2026-10-07')]);
    const row = document.querySelector('[data-calendar-event-row="evt"]');
    expect(row).toHaveTextContent('10:00');
    expect(row).not.toHaveTextContent('11:00');
    expect(row).toHaveTextContent('评审会');
    // 计划里不显示订阅颜色竖条
    expect(row?.querySelector('.bg-blue-500')).toBeNull();
    expect(row?.closest('[data-schedule-dropzone]')?.getAttribute('data-schedule-dropzone')).toBe(
      'date:2026-10-07',
    );
    expect(
      row!.compareDocumentPosition(screen.getByTestId('row-task-1')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect([...harness.draggable.keys()]).toEqual(['task:task-1']);
  });

  it('月份分组列出区间内的日程并带日期 chip，跨天日程只出现一次', () => {
    const leave = (day: string) => eventEntry('leave', '年假', day, null);
    harness.events = new Map([
      ['2026-10-13', [eventEntry('week', '本周日程', '2026-10-13', '09:00')]],
      ['2026-10-20', [eventEntry('oct', '十月日程', '2026-10-20', '14:00')]],
      ['2026-11-24', [leave('2026-11-24')]],
      ['2026-11-25', [leave('2026-11-25')]],
    ]);
    renderUpcoming([]);
    const zone = (id: string) =>
      document.querySelector<HTMLElement>(`[data-schedule-dropzone="${id}"]`)!;
    const titles = (id: string) =>
      [...zone(id).querySelectorAll('[data-calendar-event-row]')].map((row) => row.textContent);

    // 本周最后一天 10/13 的日程不重复出现在 10 月分组（10/14 起）
    expect(titles('month:2026-10')).toEqual([expect.stringContaining('十月日程')]);
    // 月份分组只到月：行上带日期 chip
    expect(titles('month:2026-10')[0]).toBe('Oct 2014:00十月日程');
    // 日期用订阅颜色的文字、无灰底，不同于任务行的日期 chip
    const date = zone('month:2026-10').querySelector('[data-calendar-event-date]');
    expect(date).toHaveClass('text-blue-600');
    expect(date).not.toHaveClass('bg-muted');
    expect(titles('month:2026-11')).toEqual([expect.stringContaining('年假')]);
  });

  it('碰撞优先任务行，再分组头、容器，忽略其他列表', () => {
    renderUpcoming([task('task-1', '2026-10-07'), task('task-2', '2026-10-08')]);
    harness.pointerIds = [
      'container:date:2026-10-08',
      'header:date:2026-10-08',
      'task:task-2',
      'container:project-1',
    ];
    expect(pointAt('task:task-2').map(({ id }) => id)).toEqual(['task:task-2']);
    harness.pointerIds = [
      'container:date:2026-10-08',
      'header:date:2026-10-08',
      'container:project-1',
    ];
    expect(pointAt('header:date:2026-10-08').map(({ id }) => id)).toEqual([
      'header:date:2026-10-08',
    ]);
  });

  it('指针越过同一行中线就实时让位；组内松手只保存顺序', () => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-10-07'),
      task('task-3', '2026-10-07'),
    ]);
    start();
    pointAt('task:task-2', 'before');
    over('task:task-2');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    pointAt('task:task-2', 'after');
    act(() => handlers().onDragMove({ active: { id: 'task:task-1' } } as DragMoveEvent));
    expect(taskOrder()).toEqual(['task-2', 'task-1', 'task-3']);
    expect(harness.reorder).not.toHaveBeenCalled();
    end('task:task-2');
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.reorder).toHaveBeenCalledWith(
      [
        { type: 'task', id: 'task-2' },
        { type: 'task', id: 'task-1' },
        { type: 'task', id: 'task-3' },
      ],
      expect.anything(),
    );
  });

  it('月份内跨具体日期排序，保留日期并按保存的顺序显示', () => {
    const items = [task('task-1', '2026-11-10'), task('task-2', '2026-11-20')];
    const view = renderUpcoming(items);
    start();
    pointAt('task:task-2', 'after');
    over('task:task-2');
    end('task:task-2');
    expect(taskOrder()).toEqual(['task-2', 'task-1']);
    expect(harness.update).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-task-1')).toHaveAttribute('data-date', '2026-11-10');
    vi.mocked(useFeedQuery).mockReturnValue({
      data: [items[1], items[0]],
      isLoading: false,
      isError: false,
    } as never);
    view.rerender(
      <MemoryRouter>
        <Upcoming />
      </MemoryRouter>,
    );
    expect(taskOrder()).toEqual(['task-2', 'task-1']);
  });

  it('多项拖拽：选中的任务一起改到落点日期，日期都写完再保存顺序', () => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-09'),
    ]);
    useSelectionStore.getState().setSelection(['task-1', 'task-2']);
    start();
    // 组内其余行收起，只有被拖行留空位
    expect(screen.queryByTestId('row-task-2')).not.toBeInTheDocument();
    over('date:2026-10-10');
    end('date:2026-10-10');

    expect(harness.update.mock.calls.map(([vars]) => vars)).toEqual([
      { id: 'task-1', data: { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-10' } },
      { id: 'task-2', data: { scheduledType: ScheduledType.DATE, scheduledDate: '2026-10-10' } },
    ]);
    expect(taskGroup('task-2')).toBe('date:2026-10-10');
    act(() => harness.update.mock.calls[0][1].onSuccess());
    expect(harness.reorder).not.toHaveBeenCalled();
    act(() => harness.update.mock.calls[1][1].onSuccess());
    expect(harness.reorder).toHaveBeenCalledWith(
      [
        { type: 'task', id: 'task-3' },
        { type: 'task', id: 'task-1' },
        { type: 'task', id: 'task-2' },
      ],
      expect.anything(),
    );
    expect(useSelectionStore.getState().selectedIds).toEqual(['task-1', 'task-2']);
  });

  it('多项拖拽从第 3 个选中行拖起：其余选中行收起', () => {
    renderUpcoming(
      ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'].map((id) => task(id, '2026-10-07')),
    );
    useSelectionStore.getState().setSelection(['task-1', 'task-2', 'task-3']);
    start('task-3');
    expect(taskOrder()).toEqual(['task-3', 'task-4', 'task-5']);
  });

  it('跨组落到具体行前后，按月份标题改期；日期写入成功后再保存顺序', () => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-11-15'),
      task('task-3', '2026-11-20'),
    ]);
    start();
    pointAt('task:task-2', 'after');
    over('task:task-2');
    expect(taskGroup()).toBe('month:2026-11');
    expect(taskOrder()).toEqual(['task-2', 'task-1', 'task-3']);
    end('task:task-2');
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-11-01');
    expect(harness.reorder).not.toHaveBeenCalled();
    act(() => harness.update.mock.calls[0][1].onSuccess());
    expect(harness.reorder).toHaveBeenCalledWith(
      [
        { type: 'task', id: 'task-2' },
        { type: 'task', id: 'task-1' },
        { type: 'task', id: 'task-3' },
      ],
      expect.anything(),
    );
  });

  it('标题作为独立分组头接收任务，落在该组第一位且没有边框反馈', () => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
    ]);
    start();
    over('header:date:2026-10-08');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(document.querySelectorAll('[data-schedule-header]')).toHaveLength(10);
    for (const group of document.querySelectorAll('[data-schedule-dropzone]')) {
      expect(group.className).not.toMatch(/ring-|bg-accent|border/);
    }
    act(() => handlers().onDragCancel());
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(harness.reorder).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'] as const)('从标题的 %s 半区进入，均预览并保存到组首', (edge) => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-10'),
    ]);
    start();
    pointAt('header:date:2026-10-08', edge);
    over('header:date:2026-10-08');
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    end('header:date:2026-10-08');
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-10-08');
    act(() => harness.update.mock.calls[0][1].onSuccess());
    expect(harness.reorder.mock.calls[0][0]).toEqual([
      { type: 'task', id: 'task-1' },
      { type: 'task', id: 'task-2' },
      { type: 'task', id: 'task-3' },
    ]);
  });

  it('月份标题同样插入组首，按标题设为当月第一天', () => {
    renderUpcoming([
      task('task-2', '2026-11-15'),
      task('task-3', '2026-11-20'),
      task('task-1', '2026-10-07'),
    ]);
    start();
    over('header:month:2026-11');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    end('header:month:2026-11');
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-11-01');
  });

  it.each([
    [34, 'task:task-2', ['task-1', 'task-2', 'task-3']],
    [78, 'task:task-3', ['task-2', 'task-1', 'task-3']],
    [124, 'task:task-3', ['task-2', 'task-3', 'task-1']],
  ] as const)('指针在分组空隙 y=%i 时按实际位置让位', (y, expectedTarget, expectedOrder) => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
    ]);
    start();
    const container = 'container:date:2026-10-08';
    harness.pointerIds = [container];
    const collisions = handlers().collisionDetection({
      active: { id: 'task:task-1' },
      pointerCoordinates: { x: 10, y },
      droppableContainers: [container, 'header:date:2026-10-08', 'task:task-2', 'task:task-3'].map(
        (id) => ({ id }),
      ),
      droppableRects: new Map([
        [container, { top: 0, height: 130 }],
        ['header:date:2026-10-08', { top: 0, height: 32 }],
        ['task:task-2', { top: 36, height: 40 }],
        ['task:task-3', { top: 80, height: 40 }],
      ]),
    } as unknown as Parameters<CollisionDetection>[0]);
    expect(collisions.map(({ id }) => id)).toEqual([expectedTarget]);
    over(expectedTarget);
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(expectedOrder);
    end(expectedTarget);
    expect(taskOrder()).toEqual(expectedOrder);
  });

  it('组内排序保存失败时恢复原顺序并提示', () => {
    renderUpcoming([task('task-1', '2026-10-07'), task('task-2', '2026-10-07')]);
    start();
    pointAt('task:task-2', 'after');
    over('task:task-2');
    end('task:task-2');
    act(() => harness.reorder.mock.calls[0][1].onError());
    expect(taskOrder()).toEqual(['task-1', 'task-2']);
    expect(harness.error).toHaveBeenCalledTimes(1);
  });

  it('组内从末位向上拖，逐行越过中线让位，预览与保存顺序一致', () => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-08'),
    ]);
    start();
    pointAt('task:task-3', 'after');
    over('task:task-3');
    expect(taskOrder()).toEqual(['task-2', 'task-3', 'task-1']);
    pointAt('task:task-3', 'before');
    act(() => handlers().onDragMove({ active: { id: 'task:task-1' } } as DragMoveEvent));
    expect(taskOrder()).toEqual(['task-2', 'task-1', 'task-3']);
    harness.pointerIds = ['task:task-2'];
    pointAt('task:task-2', 'after');
    over('task:task-2');
    expect(taskOrder()).toEqual(['task-2', 'task-1', 'task-3']);
    pointAt('task:task-2', 'before');
    act(() => handlers().onDragMove({ active: { id: 'task:task-1' } } as DragMoveEvent));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(harness.reorder).not.toHaveBeenCalled();
    end('task:task-2');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.reorder.mock.calls[0][0].map(({ id }: { id: string }) => id)).toEqual(
      taskOrder(),
    );
  });

  it('从后一天向上跨组，先进入组尾，再穿过行间空隙到标题组首', () => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-10'),
    ]);
    start();
    const container = 'container:date:2026-10-08';
    const header = 'header:date:2026-10-08';
    const pointInEarlierGroup = (y: number, onHeader = false) => {
      harness.pointerIds = onHeader ? [container, header] : [container];
      // 每次让位后重新测量目标组的行位置，和实际拖动期间的布局变化一致。
      const group = document.querySelector('[data-schedule-dropzone="date:2026-10-08"]')!;
      const ids = [...group.querySelectorAll<HTMLElement>('[data-sortable-task-id]')].map(
        (row) => `task:${row.dataset.sortableTaskId}`,
      );
      return handlers().collisionDetection({
        active: { id: 'task:task-1' },
        pointerCoordinates: { x: 10, y },
        droppableContainers: [container, header, ...ids].map((id) => ({ id })),
        droppableRects: new Map([
          [container, { top: 0, height: 200 }],
          [header, { top: 0, height: 32 }],
          ...ids.map((id, index) => [id, { top: 36 + 44 * index, height: 40 }] as const),
        ]),
      } as unknown as Parameters<CollisionDetection>[0]);
    };
    const bottom = pointInEarlierGroup(124);
    over(String(bottom[0].id));
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(['task-2', 'task-3', 'task-1']);
    const between = pointInEarlierGroup(78);
    over(String(between[0].id));
    expect(taskOrder()).toEqual(['task-2', 'task-1', 'task-3']);
    const heading = pointInEarlierGroup(10, true);
    over(String(heading[0].id));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    end(header);
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-10-08');
    act(() => harness.update.mock.calls[0][1].onSuccess());
    expect(harness.reorder.mock.calls[0][0].map(({ id }: { id: string }) => id)).toEqual(
      taskOrder(),
    );
  });

  it.each([
    ['before', ['task-1', 'task-2', 'task-3']],
    ['after', ['task-2', 'task-1', 'task-3']],
  ] as const)('跨月向上拖到任务行 %s 半区，按该位置插入并使用目标月首日', (edge, expected) => {
    renderUpcoming([
      task('task-2', '2026-11-15'),
      task('task-3', '2026-11-20'),
      task('task-1', '2026-12-15'),
    ]);
    start();
    pointAt('task:task-2', edge);
    over('task:task-2');
    expect(taskOrder()).toEqual(expected);
    expect(taskGroup()).toBe('month:2026-11');
    end('task:task-2');
    expect(taskOrder()).toEqual(expected);
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-11-01');
  });

  it('向上拖动后取消，恢复原来的具体日期和顺序', () => {
    renderUpcoming([
      task('task-2', '2026-11-15'),
      task('task-3', '2026-11-20'),
      task('task-1', '2026-12-15'),
    ]);
    start();
    pointAt('task:task-2', 'before');
    over('task:task-2');
    act(() => handlers().onDragCancel());
    expect(taskOrder()).toEqual(['task-2', 'task-3', 'task-1']);
    expect(taskGroup()).toBe('month:2026-12');
    expect(screen.getByTestId('row-task-1')).toHaveAttribute('data-date', '2026-12-15');
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.reorder).not.toHaveBeenCalled();
  });

  it.each([2, 38])('在任务距上沿 %ipx 处抓取，向上接触标题时就进入组首', (grabOffset) => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-10'),
    ]);
    start();
    const collisions = dragCollision(25, 25 + grabOffset);
    expect(collisions.map(({ id }) => id)).toEqual(['header:date:2026-10-08']);
    over(String(collisions[0].id));
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    // 让位造成重新测量时，任务没再移动，仍用上沿，不能切回中心触发反向跳位。
    const stationary = dragCollision(25, 25 + grabOffset);
    expect(stationary.map(({ id }) => id)).toEqual(['header:date:2026-10-08']);
    act(() => handlers().onDragMove({ active: { id: 'task:task-1' } } as DragMoveEvent));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    end(String(stationary[0].id));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-10-08');
  });

  it('上沿刚越过任务行中线就向上让位，即使指针仍在该行下半区', () => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-10'),
    ]);
    start();
    const collisions = dragCollision(55, 93);
    expect(collisions.map(({ id }) => id)).toEqual(['task:task-2']);
    over(String(collisions[0].id));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
    end(String(collisions[0].id));
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('向下拖动也按下沿接触标题触发，指针尚未进入标题时就能让位', () => {
    renderUpcoming([
      task('task-1', '2026-10-07'),
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
    ]);
    start();
    const collisions = dragCollision(-20, -10, -80);
    expect(collisions.map(({ id }) => id)).toEqual(['header:date:2026-10-08']);
    over(String(collisions[0].id));
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('标题正处于让位动画时，命中可见标题的位置而不是最终布局位置', () => {
    renderUpcoming([
      task('task-2', '2026-10-08'),
      task('task-3', '2026-10-08'),
      task('task-1', '2026-10-10'),
    ]);
    start();
    harness.useGeometry = true;
    const header = 'header:date:2026-10-08';
    const container = 'container:date:2026-10-08';
    const rect = (top: number, height: number) => ({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 300,
      width: 300,
    });
    const collisions = handlers().collisionDetection({
      active: { id: 'task:task-1', rect: { current: { initial: rect(200, 40) } } },
      pointerCoordinates: { x: 10, y: 93 },
      collisionRect: rect(55, 40),
      droppableContainers: [
        { id: container },
        { id: header, node: { current: { getBoundingClientRect: () => rect(40, 32) } } },
      ],
      droppableRects: new Map([
        [container, rect(0, 200)],
        [header, rect(0, 32)],
      ]),
    } as unknown as Parameters<CollisionDetection>[0]);
    expect(collisions.map(({ id }) => id)).toEqual([header]);
    over(header);
    expect(taskGroup()).toBe('date:2026-10-08');
    expect(taskOrder()).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('跨月份拖动时，浮层和占位都保留原日期标志，松手后才变为目标日期', () => {
    renderUpcoming([task('task-1', '2026-11-15')]);
    start();
    over('header:month:2026-12');
    expect(taskGroup()).toBe('month:2026-12');
    expect(
      within(screen.getByTestId('overlay')).getByTestId('schedule-badge-task-1'),
    ).toHaveTextContent('2026-11-15');
    expect(
      within(screen.getByTestId('task-placeholder-task-1')).getByTestId('schedule-badge-task-1'),
    ).toHaveTextContent('2026-11-15');
    expect(harness.update).not.toHaveBeenCalled();
    end('header:month:2026-12');
    expect(screen.getByTestId('schedule-badge-task-1')).toHaveTextContent('2026-12-01');
    expect(harness.update.mock.calls[0][0].data.scheduledDate).toBe('2026-12-01');
  });

  it('从月份拖进日分组，拖动期间保留日期标志，结束后再按日分组隐藏', () => {
    renderUpcoming([task('task-1', '2026-11-15')]);
    start();
    over('header:date:2026-10-08');
    expect(
      within(screen.getByTestId('overlay')).getByTestId('schedule-badge-task-1'),
    ).toHaveTextContent('2026-11-15');
    expect(
      within(screen.getByTestId('task-placeholder-task-1')).getByTestId('schedule-badge-task-1'),
    ).toHaveTextContent('2026-11-15');
    end('header:date:2026-10-08');
    expect(screen.queryByTestId('schedule-badge-task-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-task-1')).toHaveAttribute('data-date', '2026-10-08');
  });

  it('从日分组拖进月份不提前新增日期标志；取消保留原状，松手后才新增', () => {
    renderUpcoming([task('task-1', '2026-10-08')]);
    start();
    over('header:month:2026-11');
    expect(screen.queryByTestId('schedule-badge-task-1')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('overlay')).getByTestId('row-task-1')).toHaveAttribute(
      'data-date',
      '2026-10-08',
    );
    act(() => handlers().onDragCancel());
    expect(screen.queryByTestId('schedule-badge-task-1')).not.toBeInTheDocument();
    expect(harness.update).not.toHaveBeenCalled();
    start();
    over('header:month:2026-11');
    end('header:month:2026-11');
    expect(screen.getByTestId('schedule-badge-task-1')).toHaveTextContent('2026-11-01');
  });
});

function dragCollision(top: number, pointerY: number, initialTop = 200) {
  harness.useGeometry = true;
  const container = 'container:date:2026-10-08';
  const header = 'header:date:2026-10-08';
  const rect = (top: number, height: number) => ({
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 300,
    width: 300,
  });
  return handlers().collisionDetection({
    active: { id: 'task:task-1', rect: { current: { initial: rect(initialTop, 40) } } },
    pointerCoordinates: { x: 10, y: pointerY },
    collisionRect: rect(top, 40),
    droppableContainers: [container, header, 'task:task-2', 'task:task-3'].map((id) => ({ id })),
    droppableRects: new Map([
      [container, rect(0, 200)],
      [header, rect(0, 32)],
      ['task:task-2', rect(36, 40)],
      ['task:task-3', rect(80, 40)],
    ]),
  } as unknown as Parameters<CollisionDetection>[0]);
}

function taskOrder() {
  return [...document.querySelectorAll<HTMLElement>('[data-sortable-task-id]')].map(
    (element) => element.dataset.sortableTaskId,
  );
}

function pointAt(target: string, edge: 'before' | 'after' = 'before') {
  const candidates = harness.pointerIds.length ? harness.pointerIds : [target];
  harness.pointerIds = candidates;
  return handlers().collisionDetection({
    active: { id: 'task:task-1' },
    pointerCoordinates: { x: 10, y: edge === 'after' ? 30 : 10 },
    droppableContainers: candidates.map((id) => ({ id })),
    droppableRects: new Map(candidates.map((id) => [id, { top: 0, height: 40 }])),
  } as unknown as Parameters<CollisionDetection>[0]);
}

describe('Upcoming — Sidebar Drop', () => {
  it('悬停侧边栏时占位回到原日期，松手交给侧边栏落点、不改期也不重排', () => {
    renderUpcoming([task('task-1', '2026-10-07'), task('task-2', '2026-10-08')]);
    start();
    over('date:2026-10-09');
    expect(taskGroup()).toBe('date:2026-10-09');

    over('sidebar-drop:someday');
    expect(taskGroup()).toBe('date:2026-10-07');

    end('sidebar-drop:someday');
    expect(harness.sidebarDrop).toHaveBeenCalledWith(
      { kind: 'tasks', tasks: [expect.objectContaining({ id: 'task-1' })] },
      { kind: 'someday' },
      null,
    );
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.reorder).not.toHaveBeenCalled();
    expect(taskGroup()).toBe('date:2026-10-07');
  });

  it('多项拖拽整组交给侧边栏落点（按显示顺序）', () => {
    renderUpcoming([task('task-1', '2026-10-07'), task('task-2', '2026-10-08')]);
    useSelectionStore.setState({ selectedIds: ['task-2', 'task-1'] });
    start('task-2');
    end('sidebar-drop:trash', 'task-2');

    const [payload, target] = harness.sidebarDrop.mock.calls[0];
    expect(target).toEqual({ kind: 'trash' });
    expect(payload.tasks.map((t: { id: string }) => t.id)).toEqual(['task-1', 'task-2']);
    expect(taskGroup('task-1')).toBe('date:2026-10-07');
    expect(harness.update).not.toHaveBeenCalled();
  });
});
