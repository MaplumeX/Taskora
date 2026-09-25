import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TaskCheckbox } from './TaskCheckbox';

describe('TaskCheckbox', () => {
  it('should render unchecked state', () => {
    render(<TaskCheckbox checked={false} onToggle={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('should render checked state', () => {
    render(<TaskCheckbox checked={true} onToggle={() => {}} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('should call onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<TaskCheckbox checked={false} onToggle={onToggle} />);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('should be disabled and not call onToggle when disabled', () => {
    const onToggle = vi.fn();
    render(<TaskCheckbox checked={false} onToggle={onToggle} disabled />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();

    fireEvent.click(checkbox);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('cancelled 态渲染 X 图标（lucide x）且可点击撤销', () => {
    const onToggle = vi.fn();
    render(<TaskCheckbox checked={false} cancelled onToggle={onToggle} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-label', 'Uncancel Task');
    expect(checkbox.querySelector('svg')).toHaveClass('lucide-x');

    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});