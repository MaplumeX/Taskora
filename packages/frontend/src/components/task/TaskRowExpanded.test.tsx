import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskResponseDto } from '@taskora/shared';
import { TaskStatus, TaskBucket, ScheduledType } from '@taskora/shared';

import { useUiInteractionStore } from '@/lib/stores/uiInteraction.store';
import { TaskItem } from './TaskItem';

/* ------------- fixtures (hoisted so vi.mock can reference them) ------------- */

const baseTask = vi.hoisted(() => ({
  id: 'task-1',
  title: 'My task',
  notes: null,
  scheduledDate: null,
  scheduledType: 'NONE' as const,
  dueDate: null,
  bucket: 'INBOX' as const,
  status: 'ACTIVE' as const,
  completedAt: null,
  trashedAt: null,
  sortOrder: 0,
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
}));

/* ------------- mocks ------------- */

vi.mock('@/lib/hooks/useTasks', () => ({
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
  useDeleteSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSubtask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUncompleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreTask: () => ({ mutate: vi.fn(), isPending: false }),
  useConvertTaskToProject: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderTasks: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/hooks/useProjects', () => ({
  useProjectsQuery: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/useAreas', () => ({
  useAreasQuery: () => ({ data: [] }),
}));

vi.mock('@/lib/hooks/useTags', () => ({
  useTagsQuery: () => ({ data: [] }),
}));

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
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
        data: { title: 'New subtask' },
      }),
      expect.anything(),
    );

    // the sortable row (parent of [data-task-item]) should NOT have opacity:0.45
    const row = document.querySelector('[data-task-item]')?.parentElement as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.style.opacity).not.toBe('0.45');
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

    // subtask block now visible
    expect(screen.getByText(/Subtasks|子任务/)).toBeInTheDocument();
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
          sortOrder: 0,
          createdAt: '2025-07-31T00:00:00.000Z',
          updatedAt: '2025-07-31T00:00:00.000Z',
        },
      ],
    };
    withQueryClient(<DndList task={taskWithSubtasks} />);

    await user.click(screen.getByText('My task'));

    // subtask block visible by default, header shows count
    expect(screen.getByText(/Subtasks|子任务/)).toBeInTheDocument();
    expect(screen.getByText('Existing subtask')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Add subtask|添加子任务/)).toBeInTheDocument();
  });
});
