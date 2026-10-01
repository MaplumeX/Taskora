import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import {
  i18n,
  useAreasQuery,
  useProjectsQuery,
  useRevealTask,
  useTagsQuery,
  useTaskSearchQuery,
  useUiInteractionStore,
} from '@taskora/api';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  TaskStatus,
  type ProjectResponseDto,
  type TaskResponseDto,
  type TaskSearchHit,
} from '@taskora/shared';

import { QuickFind } from './QuickFind';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useTagsQuery: vi.fn(),
  useTaskSearchQuery: vi.fn(),
  useRevealTask: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';

const PROJECT: ProjectResponseDto = {
  id: 'p1',
  title: 'Groceries',
  notes: null,
  areaId: 'a1',
  sortOrder: 0,
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
};

function hit(id: string, title: string, fields: Partial<TaskSearchHit> = {}): TaskSearchHit {
  return {
    task: {
      id,
      title,
      status: TaskStatus.ACTIVE,
      projectId: 'p1',
      areaId: null,
    } as TaskResponseDto,
    matchedSubtasks: [],
    rank: 'title',
    ...fields,
  };
}

let hitsByQuery: Record<string, TaskSearchHit[]> = {};
// 与真实 hook 一致：同一个搜索词的结果保持同一引用
const NO_HITS: TaskSearchHit[] = [];
const reveal = vi.fn(async () => true);

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{pathname + search}</div>;
}

function renderQuickFind() {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/inbox']}>
      <QuickFind open onOpenChange={onOpenChange} />
      <Location />
    </MemoryRouter>,
  );
  return { onOpenChange, input: screen.getByRole('combobox') };
}

const user = userEvent.setup();

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  hitsByQuery = {};
  vi.mocked(useProjectsQuery).mockReturnValue({ data: [PROJECT] } as never);
  vi.mocked(useAreasQuery).mockReturnValue({
    data: [{ id: 'a1', title: 'Home', notes: null, sortOrder: 0, createdAt: NOW, updatedAt: NOW }],
  } as never);
  vi.mocked(useTagsQuery).mockReturnValue({
    data: [
      {
        id: 'g1',
        title: 'Errand',
        color: '#3B82F6',
        sortOrder: 0,
        tagGroupId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  } as never);
  // 防抖由 hook 负责；这里同步给出结果
  vi.mocked(useTaskSearchQuery).mockImplementation((q: string) => {
    const searchedQuery = q.trim();
    return {
      data: searchedQuery ? (hitsByQuery[searchedQuery] ?? NO_HITS) : undefined,
      isPending: false,
      isError: false,
      searchedQuery,
    } as never;
  });
  vi.mocked(useRevealTask).mockReturnValue(reveal);
});

describe('QuickFind', () => {
  it('打字唤起：首字符带入输入框，输入框聚焦且后续输入接在其后', async () => {
    useUiInteractionStore.setState({ searchSeed: 'g' });
    const { input } = renderQuickFind();
    expect(input).toHaveValue('g');
    expect(input).toHaveFocus();
    expect(useUiInteractionStore.getState().searchSeed).toBeNull();
    await user.keyboard('ro');
    expect(input).toHaveValue('gro');
  });

  it('空输入显示提示，不出结果', () => {
    renderQuickFind();
    expect(screen.getByText(/Type to find tasks/)).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('按组显示列表、区域与项目、标签、任务', async () => {
    hitsByQuery.r = [hit('t1', 'Buy bread')];
    const { input } = renderQuickFind();
    await user.type(input, 'r');

    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Lists', 'Areas & Projects', 'Tags', 'Tasks']);
    const places = within(screen.getByRole('group', { name: 'Areas & Projects' }));
    expect(places.getAllByRole('option').map((o) => o.textContent)).toEqual(['Groceries' + 'Home']);
    const task = within(screen.getByRole('group', { name: 'Tasks' })).getByRole('option');
    // 所属项目以灰色小字附在行尾
    expect(task).toHaveTextContent('Buy bread');
    expect(task).toHaveTextContent('Groceries');
  });

  it('Enter 打开导航目标：关闭面板并跳转', async () => {
    const { input, onOpenChange } = renderQuickFind();
    await user.type(input, 'today{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('path')).toHaveTextContent('/today');
  });

  it('当前语言名与英文名都能命中内置列表', async () => {
    await i18n.changeLanguage('zh');
    const { input } = renderQuickFind();
    await user.type(input, 'today');
    expect(screen.getByRole('option', { name: '今天' })).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '今天');
    expect(screen.getByRole('option', { name: '今天' })).toBeInTheDocument();
  });

  it('↑/↓ 跨组移动高亮，Enter 打开任务走 Reveal', async () => {
    hitsByQuery.gro = [hit('t1', 'Grocery run')];
    const { input, onOpenChange } = renderQuickFind();
    await user.type(input, 'gro');

    // 项目 Groceries、任务 Grocery run、末尾的继续搜索
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    // 到底后回到第一项
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(reveal).toHaveBeenCalledWith('t1', { allowTrash: true });
    expect(screen.getByTestId('path')).toHaveTextContent('/inbox');
  });

  it('输入变化时高亮回到第一项', async () => {
    const { input } = renderQuickFind();
    await user.type(input, 'o');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.type(input, 'm');
    const [first] = screen.getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('Subtask 命中时在父任务下列出命中的 Subtask，并高亮关键词', async () => {
    hitsByQuery.milk = [
      hit('t1', 'Weekend', {
        matchedSubtasks: [
          { id: 's1', title: 'Buy milk' },
          { id: 's2', title: 'Milk bottles' },
        ],
        rank: 'other',
      }),
    ];
    const { input } = renderQuickFind();
    await user.type(input, 'milk');

    const option = screen.getByRole('option', { name: /Weekend/ });
    expect(within(option).getByText('Buy', { exact: false })).toBeInTheDocument();
    expect(Array.from(option.querySelectorAll('mark')).map((mark) => mark.textContent)).toEqual([
      'milk',
      'Milk',
    ]);
  });

  it('点击导航目标跳转', async () => {
    const { input } = renderQuickFind();
    await user.type(input, 'err');
    await user.click(screen.getByRole('option', { name: 'Errand' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/tags/g1');
  });

  it('没有任何命中时显示无结果，仍可继续搜索', async () => {
    const { input } = renderQuickFind();
    await user.type(input, 'zzz');
    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Continue Search/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('继续搜索：关闭面板，转到主内容区的搜索页', async () => {
    const { input, onOpenChange } = renderQuickFind();
    await user.type(input, 'old groceries');
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('path')).toHaveTextContent('/search?q=old%20groceries');
    expect(vi.mocked(useTaskSearchQuery)).not.toHaveBeenCalledWith(expect.anything(), {
      extended: true,
    });
  });
});
