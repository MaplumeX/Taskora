import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import type { AttachmentResponseDto, TaskResponseDto } from '@taskora/shared';
import { BlobUnavailableError } from '@taskora/api';

import { TaskAttachmentList, formatBytes } from './TaskAttachmentList';
import { TaskAttachmentsBadge } from './TaskAttachmentsBadge';
import { TaskRowExpanded } from './TaskRowExpanded';

const mocks = vi.hoisted(() => ({
  addFiles: vi.fn(),
  open: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  activity: null as null | 'uploading' | 'pending-upload' | 'downloading',
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useAddAttachmentFiles: () => mocks.addFiles,
  openAttachment: mocks.open,
  useBlobActivity: () => mocks.activity,
  useAttachmentPreviewUrl: () => ({ url: 'blob:preview', error: null }),
  useRenameAttachment: () => ({ mutate: mocks.rename }),
  useDeleteAttachment: () => ({ mutate: mocks.remove }),
  useReorderAttachments: () => ({ mutate: vi.fn() }),
  useUpdateTask: () => ({ mutate: vi.fn() }),
  useCreateSubtask: () => ({ mutate: vi.fn() }),
  useDeleteSubtask: () => ({ mutate: vi.fn() }),
  useReorderSubtasks: () => ({ mutate: vi.fn() }),
}));

const attachment = (overrides: Partial<AttachmentResponseDto> = {}): AttachmentResponseDto => ({
  id: 'att-1',
  taskId: 'task-1',
  name: '发票.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  blobHash: 'a'.repeat(64),
  position: 'a0',
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  ...overrides,
});

function renderWithClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.addFiles.mockReset().mockResolvedValue([]);
  mocks.open.mockReset().mockResolvedValue(undefined);
  mocks.rename.mockReset();
  mocks.remove.mockReset();
  mocks.toastError.mockReset();
  mocks.activity = null;
});

describe('formatBytes', () => {
  it('B / KB / MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15 MB');
  });
});

describe('TaskAttachmentList（ADR-0019）', () => {
  it('列出附件名与大小；点击非图片交给平台打开', async () => {
    renderWithClient(<TaskAttachmentList taskId="task-1" attachments={[attachment()]} />);
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '发票.pdf' }));
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'att-1' }));
  });

  it('图片在 lightbox 里预览，不直接打开', async () => {
    renderWithClient(
      <TaskAttachmentList
        taskId="task-1"
        attachments={[attachment({ name: 'shot.png', mimeType: 'image/png' })]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'shot.png' }));
    expect(await screen.findByRole('img', { name: 'shot.png' })).toHaveAttribute(
      'src',
      'blob:preview',
    );
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('还没上传完时提示等待，而不是报错', async () => {
    mocks.open.mockRejectedValue(new BlobUnavailableError('a'.repeat(64), 'not-uploaded'));
    renderWithClient(<TaskAttachmentList taskId="task-1" attachments={[attachment()]} />);
    await userEvent.click(screen.getByRole('button', { name: '发票.pdf' }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringMatching(/上传完成|finished uploading/),
      ),
    );
  });

  it('传输状态替代大小显示', () => {
    mocks.activity = 'pending-upload';
    renderWithClient(<TaskAttachmentList taskId="task-1" attachments={[attachment()]} />);
    expect(screen.queryByText('2.0 KB')).not.toBeInTheDocument();
  });

  it('右键菜单：改名、删除', async () => {
    renderWithClient(<TaskAttachmentList taskId="task-1" attachments={[attachment()]} />);
    const row = screen.getByRole('button', { name: '发票.pdf' }).closest('li')!;
    fireEvent.contextMenu(row);
    await userEvent.click(await screen.findByRole('button', { name: /重命名|Rename/ }));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '报销单.pdf{Enter}');
    expect(mocks.rename).toHaveBeenCalledWith(
      { id: 'att-1', taskId: 'task-1', name: '报销单.pdf' },
      expect.anything(),
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: '发票.pdf' }).closest('li')!);
    await userEvent.click(await screen.findByRole('button', { name: /删除|Delete/ }));
    expect(mocks.remove).toHaveBeenCalledWith({ id: 'att-1', taskId: 'task-1' }, expect.anything());
  });

  it('没有附件时不渲染列表', () => {
    const { container } = renderWithClient(<TaskAttachmentList taskId="task-1" attachments={[]} />);
    expect(container.querySelector('ul')).toBeNull();
  });
});

describe('展开任务卡片上的附件入口', () => {
  const task = {
    id: 'task-1',
    title: 'T',
    notes: null,
    scheduledDate: null,
    scheduledType: 'NONE',
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    bucket: 'INBOX',
    status: 'ACTIVE',
    completedAt: null,
    trashedAt: null,
    projectId: null,
    headingId: null,
    areaId: null,
    tags: [],
    subtasks: [],
    attachments: [],
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z',
  } as unknown as TaskResponseDto;

  it('回形针选文件 → 添加为附件', async () => {
    renderWithClient(<TaskRowExpanded task={task} current={task} />);
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByTestId('attachment-file-input'), file);
    expect(mocks.addFiles).toHaveBeenCalledWith('task-1', [file]);
  });

  it('从文件管理器拖入文件 → 添加为附件；非文件拖拽不接收', () => {
    const { container } = renderWithClient(<TaskRowExpanded task={task} current={task} />);
    const card = container.firstElementChild as HTMLElement;
    const file = new File(['x'], 'b.pdf', { type: 'application/pdf' });
    fireEvent.drop(card, { dataTransfer: { types: ['text/plain'], files: [file] } });
    expect(mocks.addFiles).not.toHaveBeenCalled();
    fireEvent.dragOver(card, { dataTransfer: { types: ['Files'], files: [file] } });
    fireEvent.drop(card, { dataTransfer: { types: ['Files'], files: [file] } });
    expect(mocks.addFiles).toHaveBeenCalledWith('task-1', [file]);
  });
});

describe('TaskAttachmentsBadge', () => {
  it('有附件才显示回形针', () => {
    const { container, rerender } = render(<TaskAttachmentsBadge attachments={[]} />);
    expect(container.querySelector('[data-attachments-badge]')).toBeNull();
    rerender(<TaskAttachmentsBadge attachments={[attachment()]} />);
    expect(container.querySelector('[data-attachments-badge]')).not.toBeNull();
  });
});
