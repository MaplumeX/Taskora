import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import {
  i18n,
  useAreasQuery,
  useFeedQuery,
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
  type FeedItem,
  type ProjectResponseDto,
  type TaskResponseDto,
  type TaskSearchHit,
} from '@taskora/shared';

import { QuickFind } from './QuickFind';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useFeedQuery: vi.fn(),
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
/** 继续搜索（extended）时的结果。 */
let extendedHitsByQuery: Record<string, TaskSearchHit[]> = {};
const TRASH_FEED: FeedItem[] = [
  {
    ...PROJECT,
    id: 'p-trash',
    title: 'Old groceries',
    type: 'project',
    trashedAt: NOW,
    tags: [],
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
  },
];
// 与真实 hook 一致：同一个搜索词的结果保持同一引用
const NO_HITS: TaskSearchHit[] = [];
const reveal = vi.fn(async () => true);

function Location() {
  return <div data-testid="path">{useLocation().pathname}</div>;
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
  extendedHitsByQuery = {};
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
  vi.mocked(useTaskSearchQuery).mockImplementation((q: string, options) => {
    const searchedQuery = q.trim();
    const source = options?.extended ? extendedHitsByQuery : hitsByQuery;
    return {
      data: searchedQuery ? (source[searchedQuery] ?? NO_HITS) : undefined,
      isPending: false,
      isError: false,
      searchedQuery,
    } as never;
  });
  vi.mocked(useRevealTask).mockReturnValue(reveal);
  vi.mocked(useFeedQuery).mockImplementation(
    (_view, options) => ({ data: options?.enabled ? TRASH_FEED : undefined }) as never,
  );
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

  describe('继续搜索', () => {
    const doneHit = hit('t-done', 'Groceries last week', {
      task: {
        id: 't-done',
        title: 'Groceries last week',
        status: TaskStatus.COMPLETED,
        projectId: null,
        areaId: null,
        trashedAt: null,
      } as TaskResponseDto,
    });
    const trashedHit = hit('t-trash', 'Groceries draft', {
      task: {
        id: 't-trash',
        title: 'Groceries draft',
        status: TaskStatus.ACTIVE,
        projectId: null,
        areaId: null,
        trashedAt: NOW,
      } as TaskResponseDto,
    });

    it('Enter 触发后纳入已了结与 Trash 的任务和项目，面板保持打开', async () => {
      extendedHitsByQuery.groceries = [doneHit, trashedHit];
      const { input, onOpenChange } = renderQuickFind();
      await user.type(input, 'groceries');
      expect(screen.queryByRole('option', { name: /Old groceries/ })).toBeNull();

      await user.keyboard('{ArrowUp}{Enter}');

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(vi.mocked(useTaskSearchQuery)).toHaveBeenLastCalledWith('groceries', {
        extended: true,
      });
      expect(screen.queryByRole('option', { name: /Continue Search/ })).toBeNull();
      const places = within(screen.getByRole('group', { name: 'Areas & Projects' }));
      expect(places.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'GroceriesHome',
        'Old groceriesHome',
      ]);
      expect(
        within(places.getAllByRole('option')[1]).getByRole('img', { name: 'In Trash' }),
      ).toBeInTheDocument();
      const tasks = within(screen.getByRole('group', { name: 'Tasks' })).getAllByRole('option');
      expect(within(tasks[1]).getByRole('img', { name: 'In Trash' })).toBeInTheDocument();
    });

    it('打开 Trash 中的任务：Reveal 允许定位到 Trash', async () => {
      extendedHitsByQuery.draft = [trashedHit];
      const { input } = renderQuickFind();
      await user.type(input, 'draft');
      await user.click(screen.getByRole('option', { name: /Continue Search/ }));
      await user.click(screen.getByRole('option', { name: /draft/ }));
      expect(reveal).toHaveBeenCalledWith('t-trash', { allowTrash: true });
    });

    it('清空输入后恢复默认范围', async () => {
      const { input } = renderQuickFind();
      await user.type(input, 'x');
      await user.click(screen.getByRole('option', { name: /Continue Search/ }));
      expect(vi.mocked(useTaskSearchQuery)).toHaveBeenLastCalledWith('x', { extended: true });
      await user.clear(input);
      await user.type(input, 'y');
      expect(vi.mocked(useTaskSearchQuery)).toHaveBeenLastCalledWith('y', { extended: false });
      expect(screen.getByRole('option', { name: /Continue Search/ })).toBeInTheDocument();
    });
  });
});
