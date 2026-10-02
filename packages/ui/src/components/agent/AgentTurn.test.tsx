import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { i18n } from '@taskora/api';

import type { ChatTurn, ToolChatItem } from './buildChatItems';
import { AgentTurn } from './AgentTurn';

const tool = (overrides: Partial<ToolChatItem>): ToolChatItem => ({
  kind: 'tool',
  id: overrides.toolCallId ?? 'c',
  toolCallId: 'c',
  toolName: 'get_task',
  args: {},
  status: 'done',
  resultText: null,
  entityTitle: null,
  ...overrides,
});

const turn = (overrides: Partial<ChatTurn>): ChatTurn => ({
  kind: 'turn',
  id: 't',
  steps: [],
  answer: null,
  answerStreaming: false,
  active: false,
  ...overrides,
});

describe('AgentTurn', () => {
  it('collapses the process to a one-line summary above the answer', async () => {
    await i18n.changeLanguage('en');
    const update = tool({
      toolCallId: 'b',
      toolName: 'update_task',
      args: { id: 'uuid-1' },
      entityTitle: 'Write report',
    });
    render(
      <AgentTurn
        turn={turn({
          steps: [
            { kind: 'thinking', id: 'th', text: 'Look at today first' },
            tool({ toolCallId: 'a', toolName: 'search', args: { q: 'report' } }),
            update,
            tool({ toolCallId: 'c', toolName: 'delete_task', status: 'error' }),
          ],
          answer: 'All tidy.',
        })}
      />,
    );
    // Failed writes count as failures, not changes.
    expect(screen.getByRole('button', { name: 'Changed 1 item, 1 failed' })).toBeInTheDocument();
    expect(screen.queryByText('Update task')).not.toBeInTheDocument();
    expect(screen.getByText('All tidy.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Changed 1 item/ }));
    expect(screen.getByText('「report」')).toBeInTheDocument();
    expect(screen.getByText('「Write report」')).toBeInTheDocument();
    expect(screen.queryByText(/uuid-1/)).not.toBeInTheDocument();
    expect(screen.getByText('Look at today first')).toBeInTheDocument();
  });

  it('shows the current step live while the agent works', async () => {
    await i18n.changeLanguage('zh');
    render(
      <AgentTurn
        turn={turn({
          active: true,
          steps: [
            tool({ toolCallId: 'a', toolName: 'list_feed', args: { view: 'today' } }),
            tool({
              toolCallId: 'b',
              toolName: 'create_task',
              args: { title: '买牛奶' },
              status: 'running',
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText('创建任务 「买牛奶」')).toBeInTheDocument();
  });

  it('renders a plain reply without a process line', async () => {
    await i18n.changeLanguage('en');
    render(<AgentTurn turn={turn({ answer: 'Hello!' })} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    [
      [tool({ toolName: 'search' }), tool({ toolCallId: 'b', toolName: 'list_tags' })],
      '查看了 2 次数据',
    ],
    [[tool({ toolName: 'create_task', status: 'error' })], '1 项失败'],
    [[{ kind: 'thinking' as const, id: 'th', text: '…' }], '已思考'],
  ])('summarizes lookups, failures and pure thinking', async (steps, label) => {
    await i18n.changeLanguage('zh');
    render(<AgentTurn turn={turn({ steps, answer: 'ok' })} />);
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });
});
