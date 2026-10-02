import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';

import { useUiInteractionStore } from '@taskora/api';
import { TaskItem } from './TaskItem';
import { mockDesktop } from '@/test/media';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  taskKeys: { detail: (id: string) => ['task', id] },
  useTaskQuery: () => ({
    data: null,
  }),
  useCreateSubtask: () => ({
    mutate: mutationMocks.createSubtask,
    isPending: false,
  }),
  useCompleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSubtask: () => ({ mutate: mutationMocks.deleteSubtask, isPending: false }),
  useUpdateSubtask: () => ({ mutate: mutationMocks.updateSubtask, isPending: false }),
  useReorderSubtasks: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderTasks: () => ({ mutate: vi.fn(), isPending: false }),
  useProjectsQuery: () => ({ data: [] }),
  useAreasQuery: () => ({ data: [] }),
  useTagsQuery: () => ({ data: [] }),
}));

/* ------------- fixtures (hoisted so vi.mock can reference them) ------------- */

const baseTask = vi.hoisted(() => ({
  id: 'task-1',
  title: 'My task',
  notes: null,
  scheduledDate: null,
  scheduledType: 'NONE' as const,
  reminderTime: null,
  repeatRule: null,
  repeatSourceId: null,
  dueDate: null,
  bucket: 'INBOX' as const,
  status: 'ACTIVE' as const,
  completedAt: null,
  trashedAt: null,
  projectId: null,
  headingId: null,
  areaId: null,
  tags: [] as TaskResponseDto['tags'],
  subtasks: [] as TaskResponseDto['subtasks'],
  createdAt: '2025-07-31T00:00:00.000Z',
  updatedAt: '2025-07-31T00:00:00.000Z',
}));

const mutationMocks = vi.hoisted(() => ({
  createSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
  updateSubtask: vi.fn(),
}));

/* ------------- mocks ------------- */

/* ------------- task object for render ------------- */

const renderTask: TaskResponseDto = {
  ...baseTask,
  scheduledType: ScheduledType.NONE,
  bucket: TaskBucket.INBOX,
  status: TaskStatus.ACTIVE,
};

/* ------------- query client wrapper ------------- */

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/* ------------- sortable wrapper (mirrors SortableTask) ------------- */

function SortableWrapper({ children, id }: { children: React.ReactNode; id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function DndList({ task }: { task: TaskResponseDto }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const expandedId = useUiInteractionStore((s) => s.expandedId);
  const setExpandedId = useUiInteractionStore((s) => s.setExpandedId);
  const selectionState = expandedId === task.id ? 'expanded' : 'idle';
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={() => {}}>
      <SortableContext items={[task.id]} strategy={verticalListSortingStrategy}>
        <SortableWrapper id={task.id}>
          <TaskItem
            task={task}
            selectionState={selectionState}
            onToggleComplete={() => {}}
            onRowClick={() => {
              if (expandedId === task.id) {
                setExpandedId(null);
              } else {
                setExpandedId(task.id);
              }
            }}
          />
        </SortableWrapper>
      </SortableContext>
    </DndContext>
  );
}

/* ------------- tests ------------- */

describe('TaskRowExpanded — DnD keyboard stuck regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('does not get stuck in isDragging after Enter in subtask input', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);

    // expand the row
    await user.click(screen.getByText('My task'));
    expect(useUiInteractionStore.getState().expandedId).toBe('task-1');

    // subtask block is hidden when there are no subtasks; reveal via Add subtask button
    const addSubtaskBtn = screen.getByRole('button', { name: /Add subtask|添加子任务/ });
    await user.click(addSubtaskBtn);

    // find subtask input and type + Enter
    const subtaskInput = screen.getByPlaceholderText(/Add subtask|添加子任务/) as HTMLInputElement;
    await user.type(subtaskInput, 'New subtask');
    await user.keyboard('{Enter}');

    // createSubtask should have been called (subtask created)
    expect(mutationMocks.createSubtask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        data: expect.objectContaining({ title: 'New subtask' }),
      }),
      expect.anything(),
    );

    // the sortable row (parent of [data-task-item]) should NOT have opacity:0.45
    const row = document.querySelector('[data-task-item]')?.parentElement as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.style.opacity).not.toBe('0.45');
  });
});

describe('TaskRowExpanded — icon button hints', () => {
  // hover 提示只在宽屏（Popover 形态）挂载；窄屏为居中卡片、无 hover。
  let restoreMedia: () => void;
  afterEach(() => restoreMedia());

  beforeEach(() => {
    restoreMedia = mockDesktop(true);
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('shows tooltip hints for field icon buttons on hover', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);

    await user.click(screen.getByText('My task'));

    // 三个字段图标按钮（日期/到期/标签）hover 后应浮出 hint 文案。
    // Hint 为真实 400ms 延迟（非 fake timers），逐个 hover/unhover
    // 在 CI 慢环境下可能超过默认 5s，这里放宽单测超时。
    const labelPatterns: RegExp[] = [/^(Date|日期)$/, /^(Due|到期)$/, /^(Tags|标签)$/];
    for (const pattern of labelPatterns) {
      const btn = screen.getByRole('button', { name: pattern });
      await user.hover(btn);
      expect(await screen.findByText(pattern)).toBeInTheDocument();
      await user.unhover(btn);
    }
  }, 15000);
});

describe('TaskRowExpanded — 今天 chip 图标色', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('今天 chip 的黄星保留 text-today，不被 chip 的 muted 图标色覆盖', async () => {
    const user = userEvent.setup();
    const task: TaskResponseDto = {
      ...renderTask,
      scheduledType: ScheduledType.DATE,
      scheduledDate: '2020-01-01',
    };
    withQueryClient(<DndList task={task} />);

    await user.click(screen.getByText('My task'));

    const chip = screen.getByRole('button', { name: /^(Date|日期)$/ });
    const star = chip.querySelector('svg');
    expect(star).toBeTruthy();
    expect(star!.classList.contains('fill-today')).toBe(true);
    expect(star!.classList.contains('text-today')).toBe(true);
    // 回归：chip 曾用 [&_svg]:text-muted-foreground 强制所有图标变灰，
    // 覆盖 svg 自身的 text-today，导致黄星带灰描边、和行内徽标不一致。
    expect(chip.className).not.toContain('[&_svg]:text-muted-foreground');
  });
});

describe('TaskItem — 展开时隐藏备注/子任务徽标', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('收起时显示徽标，展开后隐藏（详情区已直接展示备注与子任务）', async () => {
    const user = userEvent.setup();
    const task: TaskResponseDto = {
      ...renderTask,
      notes: 'some note',
      subtasks: [
        {
          id: 'sub-1',
          title: 'Existing subtask',
          status: TaskStatus.ACTIVE,
          completedAt: null,
          taskId: 'task-1',
          createdAt: '2025-07-31T00:00:00.000Z',
          updatedAt: '2025-07-31T00:00:00.000Z',
        },
      ],
    };
    withQueryClient(<DndList task={task} />);

    expect(document.querySelector('[data-notes-badge]')).toBeInTheDocument();
    expect(document.querySelector('[data-subtasks-badge]')).toBeInTheDocument();

    await user.click(screen.getByText('My task'));

    expect(document.querySelector('[data-notes-badge]')).toBeNull();
    expect(document.querySelector('[data-subtasks-badge]')).toBeNull();
  });
});

describe('TaskRowExpanded — hide subtask empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('hides subtask block and shows Add subtask button when no subtasks', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);

    await user.click(screen.getByText('My task'));

    // no subtask block visible
    expect(screen.queryByText(/Subtasks|子任务/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Add subtask|添加子任务/)).not.toBeInTheDocument();

    // Add subtask button visible in icon row
    expect(screen.getByRole('button', { name: /Add subtask|添加子任务/ })).toBeInTheDocument();
  });

  it('reveals subtask block with focused input on Add subtask click', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);

    await user.click(screen.getByText('My task'));

    const addSubtaskBtn = screen.getByRole('button', { name: /Add subtask|添加子任务/ });
    await user.click(addSubtaskBtn);

    const input = screen.getByPlaceholderText(/Add subtask|添加子任务/) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('shows subtask block by default when subtasks exist', async () => {
    const user = userEvent.setup();
    const taskWithSubtasks: TaskResponseDto = {
      ...renderTask,
      subtasks: [
        {
          id: 'sub-1',
          title: 'Existing subtask',
          status: TaskStatus.ACTIVE,
          completedAt: null,
          taskId: 'task-1',
          createdAt: '2025-07-31T00:00:00.000Z',
          updatedAt: '2025-07-31T00:00:00.000Z',
        },
      ],
    };
    withQueryClient(<DndList task={taskWithSubtasks} />);

    await user.click(screen.getByText('My task'));

    // 无标题、无常驻添加输入框：子任务直接以可编辑行展示（Things 3 Checklist）
    expect(screen.queryByText(/Subtasks|子任务/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing subtask')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Add subtask|添加子任务/)).not.toBeInTheDocument();

    // Add subtask button should NOT be shown when subtasks already exist
    expect(
      screen.queryByRole('button', { name: /Add subtask|添加子任务/ }),
    ).not.toBeInTheDocument();
  });
});

describe('TaskItem — Reveal Task 滚入视野', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView =
      scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('被定位的行展开后滚到视野中央，且只滚一次', async () => {
    useUiInteractionStore.setState({ expandedId: 'task-1', revealId: 'task-1' });
    withQueryClient(<DndList task={renderTask} />);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }));
    expect(useUiInteractionStore.getState().revealId).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('普通展开（无定位请求）不滚动', async () => {
    useUiInteractionStore.setState({ expandedId: 'task-1', revealId: null });
    withQueryClient(<DndList task={renderTask} />);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('TaskSubtaskList — Things 3 式就地编辑', () => {
  const subtask = (id: string, title: string, index: number) => ({
    id,
    title,
    status: TaskStatus.ACTIVE,
    completedAt: null,
    taskId: 'task-1',
    position: `a${index}`,
    createdAt: '2025-07-31T00:00:00.000Z',
    updatedAt: '2025-07-31T00:00:00.000Z',
  });
  const taskWith = (...subtasks: ReturnType<typeof subtask>[]): TaskResponseDto => ({
    ...renderTask,
    subtasks,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useUiInteractionStore.setState({ expandedId: null, pendingAutoEditId: null });
  });

  it('在某项上 Enter：其下方出现聚焦的新项，输入后带 afterId 与客户端 id 创建', async () => {
    const user = userEvent.setup();
    withQueryClient(
      <DndList task={taskWith(subtask('sub-1', '一', 0), subtask('sub-2', '三', 1))} />,
    );
    await user.click(screen.getByText('My task'));

    await user.click(screen.getByDisplayValue('一'));
    await user.keyboard('{Enter}');

    const draft = screen.getByPlaceholderText(/Add subtask|添加子任务/) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(draft));
    // 草稿行插在「一」与「三」之间
    const values = Array.from(document.querySelectorAll('li input')).map(
      (el) => (el as HTMLInputElement).value || (el as HTMLInputElement).placeholder,
    );
    expect(values).toEqual(['一', expect.stringMatching(/Add subtask|添加子任务/), '三']);

    await user.type(draft, '二{Enter}');
    expect(mutationMocks.createSubtask).toHaveBeenCalledWith(
      {
        taskId: 'task-1',
        data: { id: expect.any(String), title: '二', afterId: 'sub-1' },
      },
      expect.anything(),
    );
    // 草稿行留下继续输入，且已清空
    expect(document.activeElement).toBe(draft);
    expect(draft.value).toBe('');
  });

  it('连续 Enter：下一项以上一项的客户端 id 为 afterId', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);
    await user.click(screen.getByText('My task'));
    await user.click(screen.getByRole('button', { name: /Add subtask|添加子任务/ }));

    const draft = screen.getByPlaceholderText(/Add subtask|添加子任务/);
    await waitFor(() => expect(document.activeElement).toBe(draft));
    await user.type(draft, 'a{Enter}b{Enter}');

    const [first, second] = mutationMocks.createSubtask.mock.calls.map((c) => c[0].data);
    expect(first).toEqual({ id: expect.any(String), title: 'a' });
    expect(second).toEqual({ id: expect.any(String), title: 'b', afterId: first.id });
  });

  it('多行粘贴拆成多项并依次链接', async () => {
    const user = userEvent.setup();
    withQueryClient(<DndList task={renderTask} />);
    await user.click(screen.getByText('My task'));
    await user.click(screen.getByRole('button', { name: /Add subtask|添加子任务/ }));

    const draft = screen.getByPlaceholderText(/Add subtask|添加子任务/);
    await waitFor(() => expect(document.activeElement).toBe(draft));
    await user.paste('甲\n\n乙\n丙');

    const data = mutationMocks.createSubtask.mock.calls.map((c) => c[0].data);
    expect(data.map((d) => d.title)).toEqual(['甲', '乙', '丙']);
    expect(data[1].afterId).toBe(data[0].id);
    expect(data[2].afterId).toBe(data[1].id);
  });

  it('空项上 Backspace 删除该项，焦点回到上一项', async () => {
    const user = userEvent.setup();
    withQueryClient(
      <DndList task={taskWith(subtask('sub-1', '一', 0), subtask('sub-2', 'x', 1))} />,
    );
    await user.click(screen.getByText('My task'));

    await user.click(screen.getByDisplayValue('x'));
    await user.keyboard('{Backspace}');
    expect(mutationMocks.deleteSubtask).not.toHaveBeenCalled();
    await user.keyboard('{Backspace}');

    expect(mutationMocks.deleteSubtask).toHaveBeenCalledWith({ id: 'sub-2', taskId: 'task-1' });
    expect(document.activeElement).toBe(screen.getByDisplayValue('一'));
  });

  it('↑↓ 在项间移动焦点；失焦提交改名', async () => {
    const user = userEvent.setup();
    withQueryClient(
      <DndList task={taskWith(subtask('sub-1', '一', 0), subtask('sub-2', '二', 1))} />,
    );
    await user.click(screen.getByText('My task'));

    await user.click(screen.getByDisplayValue('一'));
    await user.keyboard('!{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByDisplayValue('二'));
    expect(mutationMocks.updateSubtask).toHaveBeenCalledWith(
      { id: 'sub-1', data: { title: '一!' } },
      expect.anything(),
    );

    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(screen.getByDisplayValue('一!'));
  });

  it('每项有拖拽排序把手', async () => {
    const user = userEvent.setup();
    withQueryClient(
      <DndList task={taskWith(subtask('sub-1', '一', 0), subtask('sub-2', '二', 1))} />,
    );
    await user.click(screen.getByText('My task'));

    expect(screen.getAllByRole('button', { name: /Drag to reorder|拖动以排序/ })).toHaveLength(2);
  });
});
