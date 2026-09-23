import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TaskReminderBadge } from './TaskReminderBadge';

describe('TaskReminderBadge — Task 行时钟徽标（reminders spec）', () => {
  it('设置提醒时显示 Clock 图标 + HH:mm', () => {
    render(<TaskReminderBadge reminderTime="09:00" />);
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('未设置提醒（null）不渲染', () => {
    const { container } = render(<TaskReminderBadge reminderTime={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
