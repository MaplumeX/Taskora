import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskResponseDto } from '@taskora/shared';

const harness = vi.hoisted(() => ({
  taskItemProps: null as Record<string, unknown> | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('./TaskItem', () => ({
  TaskItem: (props: Record<string, unknown>) => {
    harness.taskItemProps = props;
    return null;
  },
}));

import { TaskList } from './TaskList';

const noop = () => undefined;

const task = {
  id: 't1',
  title: 'Area task',
  status: 'ACTIVE',
  projectId: null,
  areaId: 'a1',
  subtasks: [],
  tags: [],
} as unknown as TaskResponseDto;

beforeEach(() => {
  harness.taskItemProps = null;
});

describe('TaskList empty state', () => {
  it('默认在空列表上显示空状态（可自定义提示）', () => {
    render(<TaskList tasks={[]} onToggleComplete={noop} emptyHint="该区域下没有任务" />);
    expect(screen.getByText('该区域下没有任务')).toBeInTheDocument();
  });

  it('hideEmptyState 时不渲染空状态与占位', () => {
    const { container } = render(<TaskList tasks={[]} onToggleComplete={noop} hideEmptyState />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TaskList ownership', () => {
  it('默认在行上透传归属标题', () => {
    render(<TaskList tasks={[task]} areas={{ a1: 'My Area' }} onToggleComplete={noop} />);
    expect(harness.taskItemProps?.areaTitle).toBe('My Area');
  });

  it('hideOwnership 时不在行上重复归属小字', () => {
    render(
      <TaskList tasks={[task]} areas={{ a1: 'My Area' }} hideOwnership onToggleComplete={noop} />,
    );
    expect(harness.taskItemProps?.areaTitle).toBeUndefined();
  });
});
