import { useState } from 'react';
import { useImportData, usePreviewImport } from '@taskora/api';
import type { DataImportPreview, DataImportStats } from '@taskora/shared';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** 预览与结果里展示的条目（同步实体名 / 统计键 → 文案键后缀）。 */
const ENTITY_LABELS: Array<[string, string]> = [
  ['area', 'area'],
  ['project', 'project'],
  ['project-heading', 'projectHeading'],
  ['task', 'task'],
  ['subtask', 'subtask'],
  ['tag', 'tag'],
  ['attachment', 'attachment'],
  ['calendarSubscriptions', 'calendarSubscriptions'],
];

const SKIP_LABELS: Record<string, string> = {
  'missing-parent': 'missingParent',
  'missing-blob': 'missingBlob',
  'duplicate-calendar': 'duplicateCalendar',
  'unknown-entity': 'unknownEntity',
};

const ERROR_LABELS: Record<string, string> = {
  'invalid-package': 'invalidPackage',
  'unsupported-format': 'unsupportedFormat',
  'blob-mismatch': 'blobMismatch',
};

/** 请求错误 → 文案：422 带错误码，404 为上传过期，409 为已有导入在进行。 */
export function importErrorText(error: unknown, t: TFunction): string {
  const response = (error as { response?: { status?: number; data?: { message?: unknown } } })
    .response;
  const code = response?.data?.message;
  if (typeof code === 'string' && ERROR_LABELS[code]) {
    return t(`settings:importError_${ERROR_LABELS[code]}`);
  }
  if (response?.status === 404) return t('settings:importError_expired');
  if (response?.status === 409) return t('settings:importError_busy');
  return t('settings:importFailed');
}

function formatTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

function CountList({ counts, t }: { counts: Record<string, number>; t: TFunction }) {
  const rows = ENTITY_LABELS.filter(([key]) => (counts[key] ?? 0) > 0);
  if (rows.length === 0) return null;
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([key, label]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{t(`settings:importEntity_${label}`)}</dt>
          <dd className="text-right tabular-nums">{counts[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stats({ stats, t }: { stats: DataImportStats; t: TFunction }) {
  const skipped = Object.entries(stats.skipped).filter(([, count]) => (count ?? 0) > 0);
  const created = Object.values(stats.created).some((count) => count > 0);
  return (
    <div className="flex flex-col gap-3 text-sm">
      {created ? (
        <CountList counts={stats.created} t={t} />
      ) : (
        <p className="text-muted-foreground">{t('settings:importNothingCreated')}</p>
      )}
      {stats.mergedTags > 0 && (
        <p>
          {t('settings:importMergedTags')}: {stats.mergedTags}
        </p>
      )}
      {skipped.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t('settings:importSkipped')}</p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {skipped.map(([reason, count]) => (
              <li key={reason}>
                {t(`settings:importSkip_${SKIP_LABELS[reason] ?? 'unknownEntity'}`)}: {count}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export type DataImportFlow = ReturnType<typeof useDataImportFlow>;

/**
 * 导入流程的状态：start(file) 上传并预览 → confirm() 导入 → 结果。导入的
 * 内容作为新数据追加，不覆盖现有数据（`.scratch/data-import/spec.md`）。
 */
export function useDataImportFlow() {
  const { t } = useTranslation(['settings', 'common']);
  const previewMutation = usePreviewImport();
  const importMutation = useImportData();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<DataImportPreview | null>(null);
  const [stats, setStats] = useState<DataImportStats | null>(null);
  const [importPreferences, setImportPreferences] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = (file: File) => {
    setOpen(true);
    setProgress(0);
    setPreview(null);
    setStats(null);
    setImportPreferences(false);
    setError(null);
    previewMutation.mutate(
      { file, onProgress: setProgress },
      { onSuccess: setPreview, onError: (err) => setError(importErrorText(err, t)) },
    );
  };

  const confirm = () => {
    if (!preview) return;
    importMutation.mutate(
      { uploadId: preview.uploadId, importPreferences },
      { onSuccess: setStats, onError: (err) => setError(importErrorText(err, t)) },
    );
  };

  const busy = previewMutation.isPending || importMutation.isPending;
  const close = () => {
    if (!busy) setOpen(false);
  };

  return {
    open,
    progress,
    preview,
    stats,
    error,
    importPreferences,
    setImportPreferences,
    importing: importMutation.isPending,
    busy,
    start,
    confirm,
    close,
  };
}

export function DataImportDialog({ flow }: { flow: DataImportFlow }) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const { preview, stats, error, close } = flow;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (error) {
    body = <p className="text-sm text-destructive">{error}</p>;
    footer = <Button onClick={close}>{t('common:close')}</Button>;
  } else if (stats) {
    body = <Stats stats={stats} t={t} />;
    footer = <Button onClick={close}>{t('common:done')}</Button>;
  } else if (preview) {
    const { manifest } = preview;
    body = (
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('settings:importExportedAt')}</dt>
          <dd className="text-right">{formatTime(manifest.exportedAt, i18n.language)}</dd>
          <dt className="text-muted-foreground">{t('settings:importHubVersion')}</dt>
          <dd className="text-right">{manifest.hubVersion}</dd>
          <dt className="text-muted-foreground">{t('settings:importAttachmentFiles')}</dt>
          <dd className="text-right">
            {manifest.includesBlobs
              ? t('settings:importBlobsIncluded')
              : t('settings:importBlobsExcluded')}
          </dd>
        </dl>
        <CountList counts={manifest.counts} t={t} />
        {preview.alreadyImportedAt && (
          <p className="text-destructive">
            {t('settings:importAlreadyImported', {
              time: formatTime(preview.alreadyImportedAt, i18n.language),
            })}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="import-preferences">{t('settings:importPreferences')}</Label>
            <Switch
              id="import-preferences"
              checked={flow.importPreferences}
              onCheckedChange={flow.setImportPreferences}
              disabled={flow.importing}
            />
          </div>
          <p className="text-muted-foreground">{t('settings:importPreferencesHint')}</p>
        </div>
      </div>
    );
    footer = (
      <>
        <Button variant="outline" onClick={close} disabled={flow.importing}>
          {t('common:cancel')}
        </Button>
        <Button onClick={flow.confirm} disabled={flow.importing}>
          {flow.importing ? t('settings:importing') : t('settings:importConfirm')}
        </Button>
      </>
    );
  } else {
    body = (
      <p className="text-sm text-muted-foreground">
        {flow.progress < 1
          ? t('settings:importUploading', { percent: Math.round(flow.progress * 100) })
          : t('settings:importReading')}
      </p>
    );
    footer = null;
  }

  return (
    <Dialog
      open={flow.open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {stats ? t('settings:importDoneTitle') : t('settings:importPreviewTitle')}
          </DialogTitle>
          {!stats && !error && (
            <DialogDescription>{t('settings:importAppendNote')}</DialogDescription>
          )}
        </DialogHeader>
        {body}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
