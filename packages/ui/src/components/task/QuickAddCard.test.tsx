import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { i18n } from '@taskora/api';
import type { AreaResponseDto, ProjectResponseDto, TagResponseDto } from '@taskora/shared';
import { ProjectStatus, ScheduledType } from '@taskora/shared';

import { mockDesktop } from '@/test/media';
import { EMPTY_QUICK_ADD_STATE, QuickAddCard, draftFromState } from './QuickAddCard';

const NOW = '2026-09-01T00:00:00.000Z';
const createTag = vi.fn();

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useTagsQuery: () => ({
    data: [
      {
        id: 't1',
        title: 'Work',
        color: '#3B82F6',
        tagGroupId: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] satisfies TagResponseDto[],
  }),
  useTagGroupsQuery: () => ({ data: [] }),
  useCreateTag: () => ({ mutate: createTag, isPending: false }),
  useProjectsQuery: () => ({
    data: [
      {
        id: 'p1',
        title: 'Renovation',
        areaId: null,
        status: ProjectStatus.ACTIVE,
        taskTotalCount: 0,
        taskCompletedCount: 0,
      } as unknown as ProjectResponseDto,
    ],
  }),
  useAreasQuery: () => ({ data: [] as AreaResponseDto[] }),
  useLaterProjectKind: () => () => null,
  getClientKind: () => 'desktop',
}));

const user = userEvent.setup();
let restoreMedia: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  restoreMedia = mockDesktop(true);
});

afterEach(() => restoreMedia());

function renderCard(onSubmit = vi.fn()) {
  const onCancel = vi.fn();
  render(<QuickAddCard onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel, title: screen.getByRole('textbox', { name: 'New task' }) };
}

describe('draftFromState', () => {
  it('只有标题时草稿只带标题（trim）', () => {
    expect(draftFromState({ ...EMPTY_QUICK_ADD_STATE, title: '  Milk ' })).toEqual({
      title: 'Milk',
    });
  });

  it('日期计划带 Reminder；Someday 不带；项目优先于区域', () => {
    expect(
      draftFromState({
        ...EMPTY_QUICK_ADD_STATE,
        title: 'Measure',
        notes: 'living room',
        scheduledType: ScheduledType.DATE,
        scheduledDate: '2026-10-03',
        reminderTime: '09:30',
        dueDate: '2026-10-10',
        tagIds: ['t1'],
        projectId: 'p1',
        areaId: 'a1',
      }),
    ).toEqual({
      title: 'Measure',
      notes: 'living room',
      when: { type: 'date', date: '2026-10-03' },
      reminderTime: '09:30',
      dueDate: '2026-10-10',
      tagIds: ['t1'],
      projectId: 'p1',
    });
    expect(
      draftFromState({
        ...EMPTY_QUICK_ADD_STATE,
        title: 'Guitar',
        scheduledType: ScheduledType.SOMEDAY,
        reminderTime: '09:00',
        areaId: 'a1',
      }),
    ).toEqual({ title: 'Guitar', when: { type: 'someday' }, areaId: 'a1' });
  });
});

describe('QuickAddCard', () => {
  it('标题框回车提交并清空；空标题不提交', async () => {
    const { onSubmit, title } = renderCard();
    await user.type(title, '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(title);
    await user.type(title, 'Buy milk{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Buy milk' }, { keepOpen: false });
    expect(title).toHaveValue('');
  });

  it('输入法组字中的回车不提交', async () => {
    const { onSubmit, title } = renderCard();
    await user.type(title, 'Milk');
    title.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('默认归属为收件箱；选项目后进入草稿，「添加并继续」保留归属', async () => {
    const { onSubmit, title } = renderCard();
    const placement = screen.getByRole('button', { name: 'Where' });
    expect(placement).toHaveTextContent('Inbox');

    await user.click(placement);
    await user.click(await screen.findByRole('option', { name: /Renovation/ }));
    expect(placement).toHaveTextContent('Renovation');

    await user.type(title, 'Measure');
    await user.keyboard('{Control>}{Shift>}{Enter}{/Shift}{/Control}');
    expect(onSubmit).toHaveBeenLastCalledWith(
      { title: 'Measure', projectId: 'p1' },
      { keepOpen: true },
    );
    expect(title).toHaveValue('');
    expect(placement).toHaveTextContent('Renovation');
  });

  it('Tag：选中后显示为 chip 并进入草稿；不提供新建入口', async () => {
    const { onSubmit, title } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    const search = await screen.findByRole('combobox');
    await user.type(search, 'Nope');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    await user.clear(search);
    await user.click(screen.getByRole('option', { name: /Work/ }));
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('Work');
    await user.type(title, 'Report{Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Report', tagIds: ['t1'] }, { keepOpen: false });
    expect(createTag).not.toHaveBeenCalled();
  });

  it('Esc 清空草稿并通知关闭；选择器开着时 Esc 只关选择器', async () => {
    const { onCancel, title } = renderCard();
    await user.type(title, 'Draft');
    await user.click(screen.getByRole('button', { name: 'Tags' }));
    await screen.findByRole('combobox');
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(title).toHaveValue('Draft');

    title.focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(title).toHaveValue('');
  });

  it('提交失败时保留草稿', async () => {
    const { title } = renderCard(vi.fn().mockRejectedValue(new Error('relay down')));
    await user.type(title, 'Keep me{Enter}');
    expect(title).toHaveValue('Keep me');
  });

  it('快捷键：⌘T 设为今天、⌘O 设为 Someday（测试环境为 web 平台，Ctrl 即主修饰键）', async () => {
    const { onSubmit, title } = renderCard();
    await user.type(title, 'Call mom');
    await user.keyboard('{Control>}t{/Control}');
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Today');

    await user.keyboard('{Control>}o{/Control}');
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent('Someday');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledWith(
      { title: 'Call mom', when: { type: 'someday' } },
      { keepOpen: false },
    );
  });

  it('快捷键直接打开归属 / Tag 选择器', async () => {
    const { title } = renderCard();
    title.focus();
    await user.keyboard('{Control>}{Shift>}M{/Shift}{/Control}');
    expect(await screen.findByRole('option', { name: /Renovation/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    title.focus();
    await user.keyboard('{Control>}{Shift>}T{/Shift}{/Control}');
    expect(await screen.findByRole('option', { name: /Work/ })).toBeInTheDocument();
  });
});
