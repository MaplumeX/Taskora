import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { i18n, useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';
import {
  ProjectBucket,
  ProjectStatus,
  ScheduledType,
  type AreaResponseDto,
  type ProjectResponseDto,
} from '@taskora/shared';

import { NavigationPopover } from './NavigationPopover';

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useProjectsQuery: vi.fn(),
  useAreasQuery: vi.fn(),
  useLaterProjectKind: vi.fn(),
}));

const NOW = '2026-09-01T00:00:00.000Z';

function project(id: string, title: string, areaId: string | null = null): ProjectResponseDto {
  return {
    id,
    title,
    notes: null,
    areaId,
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
}

const area = { id: 'a-work', title: 'Work', createdAt: NOW, updatedAt: NOW } as AreaResponseDto;

const user = userEvent.setup();

function renderPopover() {
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  render(<NavigationPopover onNavigate={onNavigate} onClose={onClose} />);
  return { onNavigate, onClose, input: screen.getByRole('combobox') };
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  void i18n.changeLanguage('en');
  vi.mocked(useProjectsQuery).mockReturnValue({
    data: [project('p-report', 'Report', 'a-work'), project('p-read', 'Reading')],
  } as unknown as ReturnType<typeof useProjectsQuery>);
  vi.mocked(useAreasQuery).mockReturnValue({
    data: [area],
  } as unknown as ReturnType<typeof useAreasQuery>);
  vi.mocked(useLaterProjectKind).mockReturnValue(() => null);
});

describe('NavigationPopover（⇧⌘O）', () => {
  it('不输入时列出内置列表，其后是区域与项目', () => {
    renderPopover();
    const names = optionNames();
    expect(names.slice(0, 2)).toEqual(['Inbox', 'Today']);
    expect(names).toContain('Work');
    expect(names).toContain('Report');
    expect(names.indexOf('Today')).toBeLessThan(names.indexOf('Work'));
  });

  it('输入过滤，Enter 前往首个结果', async () => {
    const { input, onNavigate } = renderPopover();
    expect(input).toHaveFocus();
    await user.type(input, 'rep');
    expect(optionNames()).toEqual(['ReportWork']);
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('/projects/p-report');
  });

  it('列表也按名称过滤，↓ 后 Enter 前往', async () => {
    const { input, onNavigate } = renderPopover();
    await user.type(input, 'to');
    expect(optionNames()[0]).toBe('Today');
    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith('/today');
  });
});
