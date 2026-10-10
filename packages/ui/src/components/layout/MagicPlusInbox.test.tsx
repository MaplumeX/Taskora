import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  dnd: null as null | {
    onDragStart: (event: unknown) => void;
    onDragEnd: (event: unknown) => void;
  },
  droppableData: null as null | { onDrop: () => void },
  createFromQuickAddDraft: vi.fn(),
  createTask: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const ReactModule = await import('react');
  return {
    ...(await importOriginal<typeof import('@dnd-kit/core')>()),
    DndContext: (props: { children: React.ReactNode } & NonNullable<typeof harness.dnd>) => {
      if (props) harness.dnd = props;
      return ReactModule.createElement(ReactModule.Fragment, null, props?.children);
    },
    DragOverlay: () => null,
    useDroppable: ({ data }: { data: { onDrop: () => void } }) => {
      harness.droppableData = data;
      return { setNodeRef: () => undefined, isOver: false };
    },
  };
});

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  createFromQuickAddDraft: harness.createFromQuickAddDraft,
  useCreateTask: () => ({ mutateAsync: harness.createTask }),
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: harness.toastSuccess, error: vi.fn() } }));

// 卡片本身另有测试；这里只要能提交一份草稿。
vi.mock('@/components/task/QuickAddCard', async () => {
  const ReactModule = await import('react');
  return {
    QuickAddCard: ReactModule.forwardRef(function QuickAddCard({
      onSubmit,
    }: {
      onSubmit: (draft: { title: string }, options: { keepOpen: boolean }) => void;
    }) {
      return ReactModule.createElement(
        'button',
        { type: 'button', onClick: () => onSubmit({ title: '买牛奶' }, { keepOpen: false }) },
        'submit-draft',
      );
    }),
  };
});

import { MagicPlusInbox } from './MagicPlusInbox';
import { AppDndProvider } from '../../lib/appDnd';

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <AppDndProvider>
        <MagicPlusInbox />
      </AppDndProvider>
    </MemoryRouter>,
  );
}

function startMagicPlus() {
  act(() => harness.dnd?.onDragStart({ active: { id: 'magic-plus' } }));
}

beforeEach(() => {
  harness.dnd = null;
  harness.droppableData = null;
  harness.createFromQuickAddDraft.mockReset();
  harness.toastSuccess.mockReset();
});

describe('MagicPlusInbox', () => {
  it('appears only while Magic Plus is dragged', () => {
    renderAt('/today');
    expect(screen.queryByTestId('magic-plus-inbox')).toBeNull();
    startMagicPlus();
    expect(screen.getByTestId('magic-plus-inbox')).toBeInTheDocument();
  });

  it.each(['/inbox', '/home'])('is not offered on %s', (pathname) => {
    renderAt(pathname);
    startMagicPlus();
    expect(screen.queryByTestId('magic-plus-inbox')).toBeNull();
  });

  it('dropping on it opens the quick add card; submitting creates through the shared draft path', async () => {
    harness.createFromQuickAddDraft.mockResolvedValue({
      taskId: 't1',
      placedIn: { kind: 'inbox' },
    });
    renderAt('/today');
    startMagicPlus();
    act(() =>
      harness.dnd?.onDragEnd({
        active: { id: 'magic-plus' },
        over: { id: 'magic-plus-inbox', data: { current: harness.droppableData } },
        delta: { x: -300, y: 0 },
      }),
    );

    await userEvent.click(await screen.findByRole('button', { name: 'submit-draft' }));

    expect(harness.createFromQuickAddDraft).toHaveBeenCalledWith(
      { title: '买牛奶' },
      expect.objectContaining({ createTask: expect.any(Function) }),
    );
    expect(harness.toastSuccess).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'submit-draft' })).toBeNull();
  });
});
