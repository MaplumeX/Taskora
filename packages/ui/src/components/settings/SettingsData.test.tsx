import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataImportPreview, DataImportStats } from '@taskora/shared';

import SettingsData from './SettingsData';

type Callbacks<T> = { onSuccess: (value: T) => void; onError: (error: unknown) => void };

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  importData: vi.fn(),
}));

vi.mock('@taskora/api', async (importOriginal) => ({
  ...(await importOriginal()),
  useExportData: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewImport: () => ({ mutate: mocks.preview, isPending: false }),
  useImportData: () => ({ mutate: mocks.importData, isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const previewResult: DataImportPreview = {
  uploadId: '00000000-0000-4000-8000-000000000001',
  manifest: {
    format: 1,
    exportedAt: '2026-10-16T08:00:00.000Z',
    hubVersion: '1.0.1',
    includesBlobs: true,
    counts: { task: 12, project: 2, tag: 0 },
  },
  alreadyImportedAt: null,
};

async function chooseFile() {
  const user = userEvent.setup();
  render(<SettingsData />);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, new File(['zip'], 'backup.taskora'));
  return user;
}

describe('SettingsData — 导入', () => {
  beforeEach(() => {
    mocks.preview.mockReset();
    mocks.importData.mockReset();
  });

  it('选文件后预览内容，确认后带上偏好开关导入并显示结果', async () => {
    mocks.preview.mockImplementation((_vars, cb: Callbacks<DataImportPreview>) =>
      cb.onSuccess(previewResult),
    );
    mocks.importData.mockImplementation((_vars, cb: Callbacks<DataImportStats>) =>
      cb.onSuccess({
        created: { task: 12, project: 2 },
        mergedTags: 3,
        skipped: { 'missing-blob': 1 },
      }),
    );
    const user = await chooseFile();

    expect(mocks.preview.mock.calls[0][0].file.name).toBe('backup.taskora');
    expect(await screen.findByText('Import Data Package')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Also import preferences' }));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(mocks.importData.mock.calls[0][0]).toEqual({
      uploadId: previewResult.uploadId,
      importPreferences: true,
    });
    expect(await screen.findByText('Import Complete')).toBeInTheDocument();
    expect(screen.getByText('Merged into existing tags: 3')).toBeInTheDocument();
    expect(screen.getByText('Attachment file missing: 1')).toBeInTheDocument();
  });

  it('导入过的数据包有提示', async () => {
    mocks.preview.mockImplementation((_vars, cb: Callbacks<DataImportPreview>) =>
      cb.onSuccess({ ...previewResult, alreadyImportedAt: '2026-10-15T08:00:00.000Z' }),
    );
    await chooseFile();
    expect(await screen.findByText(/was already imported on/)).toBeInTheDocument();
  });

  it('数据包无效时显示错误码对应的文案', async () => {
    mocks.preview.mockImplementation((_vars, cb: Callbacks<DataImportPreview>) =>
      cb.onError({ response: { status: 422, data: { message: 'unsupported-format' } } }),
    );
    await chooseFile();
    expect(await screen.findByText(/comes from a newer version/)).toBeInTheDocument();
  });
});
