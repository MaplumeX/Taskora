import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Hint } from './hint';
import { Button } from '@/components/ui/button';

// Hint 自带 TooltipProvider（内置 400ms 延迟），直接渲染即可。
function renderHint(props: Omit<Parameters<typeof Hint>[number], 'children'>) {
  return render(
    <Hint {...props}>
      <Button variant="ghost" size="icon">
        +
      </Button>
    </Hint>,
  );
}

const user = userEvent.setup();

describe('Hint', () => {
  it('hover 后浮出文案与平台键位（newTask / mac → ⌘N）', async () => {
    renderHint({ label: '新建任务', action: 'newTask', platform: 'mac' });
    await user.hover(screen.getByRole('button'));
    expect(await screen.findByText('新建任务')).toBeInTheDocument();
    expect(screen.getByText('⌘N')).toBeInTheDocument();
  });

  it('无快捷键动作时只显示文案，不渲染键位', async () => {
    renderHint({ label: '设置' });
    await user.hover(screen.getByRole('button'));
    expect(await screen.findByText('设置')).toBeInTheDocument();
    expect(screen.queryByText(/⌘|Ctrl|Alt/)).not.toBeInTheDocument();
  });

  it('直接指定 shortcut 时原样展示（windows: Ctrl+Alt+N）', async () => {
    renderHint({ label: '新建项目', action: 'newProject', platform: 'windows' });
    await user.hover(screen.getByRole('button'));
    expect(await screen.findByText('新建项目')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Alt+N')).toBeInTheDocument();
  });
});
