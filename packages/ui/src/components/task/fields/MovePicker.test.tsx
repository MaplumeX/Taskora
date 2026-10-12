import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { i18n, useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';
import { type ProjectResponseDto, ProjectStatus, Start } from '@taskora/shared';

import { MovePicker } from './MovePicker';
import type { MoveCurrent } from './moveTargets';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useLaterProjectKind: vi.fn(),
  useHideLaterItemsPreference: () => laterPref,
}));

const laterPref = vi.hoisted(() => ({ hidden: false, toggle: vi.fn() }));

const NOW = '2026-09-01T00:00:00.000Z';

function project(id: string, title: string, areaId: string | null = null): ProjectResponseDto {
  return {
    id,
    title,
    notes: null,
    areaId,
    status: ProjectStatus.ACTIVE,
    start: Start.ANYTIME,
    scheduledDate: null,
    dueDate: null,
    completedAt: null,
    trashedAt: null,
    taskTotalCount: 0,
    taskCompletedCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const user = userEvent.setup();

function renderPicker(current: MoveCurrent = {}) {
  const onSelect = vi.fn();
  render(<MovePicker current={current} onSelect={onSelect} />);
  return { onSelect, input: screen.getByRole('combobox') };
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  vi.mocked(useProjectsQuery).mockReturnValue({
    data: [project('p-loose', 'Reading'), project('p-report', 'Report', 'a-work')],
  } as never);
  vi.mocked(useAreasQuery).mockReturnValue({
    data: [{ id: 'a-work', title: 'Work', notes: null, createdAt: NOW, updatedAt: NOW }],
  } as never);
  vi.mocked(useLaterProjectKind).mockReturnValue(() => null);
  laterPref.hidden = false;
});

describe('MovePicker', () => {
  it('Inbox 在首位，其后与侧边栏同序；当前位置打勾并作为初始高亮', () => {
    renderPicker({ projectId: 'p-report' });
    expect(optionNames()).toEqual(['Inbox', 'Reading', 'Work', 'Report']);
    const report = screen.getByRole('option', { name: /Report/ });
    expect(report).toHaveAttribute('aria-current', 'true');
    expect(report).toHaveAttribute('aria-selected', 'true');
  });

  it('键盘：↓ 移动高亮，Enter 写入互斥的归属', async () => {
    const { onSelect, input } = renderPicker();
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ projectId: null, areaId: 'a-work' });
  });

  it('输入过滤：结果扁平并标出所属区域；点击选中', async () => {
    const { onSelect, input } = renderPicker();
    await user.type(input, 'rep');
    expect(optionNames()).toEqual(['ReportWork']);
    await user.click(screen.getByRole('option', { name: /Report/ }));
    expect(onSelect).toHaveBeenCalledWith({ projectId: 'p-report', areaId: null });
  });

  it('移到 Inbox：清除归属与计划', async () => {
    const { onSelect, input } = renderPicker({ areaId: 'a-work' });
    await user.type(input, 'inbox{Enter}');
    expect(onSelect).toHaveBeenCalledWith({
      projectId: null,
      areaId: null,
      start: Start.INBOX,
    });
  });

  it('选中当前位置不写入', async () => {
    const { onSelect, input } = renderPicker({
      start: Start.INBOX,
    });
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('无匹配时显示提示', async () => {
    const { input } = renderPicker();
    await user.type(input, 'zzz');
    expect(optionNames()).toEqual([]);
    expect(screen.getByText('No matching areas or projects')).toBeInTheDocument();
  });
});

describe('MovePicker — Hide Later Items', () => {
  beforeEach(() => {
    // 示例数据里的 Reading / Report 都是 Someday 项目
    vi.mocked(useLaterProjectKind).mockReturnValue(() => 'someday');
  });

  it('隐藏时去掉稍后项目，当前所在位置保留；按钮给出条数', () => {
    laterPref.hidden = true;
    renderPicker({ projectId: 'p-report' });
    expect(optionNames()).toEqual(['Inbox', 'Work', 'Report']);
    expect(screen.getByTestId('later-items-toggle')).toHaveTextContent('Show 1 Later Item');
  });

  it('显示时按钮为「隐藏稍后项」，点按切换偏好', async () => {
    renderPicker();
    expect(optionNames()).toEqual(['Inbox', 'Reading', 'Work', 'Report']);
    await user.click(screen.getByTestId('later-items-toggle'));
    expect(laterPref.toggle).toHaveBeenCalled();
  });

  it('输入框里 ⇧⌘E（Web 为 Alt+Shift+E）切换偏好，不写入移动', async () => {
    const { onSelect, input } = renderPicker();
    await user.click(input);
    await user.keyboard('{Alt>}{Shift>}E{/Shift}{/Alt}');
    expect(laterPref.toggle).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
