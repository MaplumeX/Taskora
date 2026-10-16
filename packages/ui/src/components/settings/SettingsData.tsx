import { useRef, useState } from 'react';
import { todayDateKey, useExportData } from '@taskora/api';
import { DATA_PACKAGE_EXTENSION } from '@taskora/shared';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { DataImportDialog, useDataImportFlow } from './DataImportDialog';
import { SettingsGroup, SettingsPage, SettingsRow, useSettingsNav } from './SettingsList';

/** 文件选择器接受的数据包：`.taskora`，以及旧版导出的 JSON。 */
const IMPORT_ACCEPT = `${DATA_PACKAGE_EXTENSION},.json,application/zip,application/json`;

export default function SettingsData() {
  const { t } = useTranslation(['settings', 'common']);
  const exportMutation = useExportData();
  const mobileNav = useSettingsNav();
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const importFlow = useDataImportFlow();
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const blob = await exportMutation.mutateAsync(includeAttachments);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taskora-${todayDateKey()}${DATA_PACKAGE_EXTENSION}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('settings:exportFailed'));
    }
  };

  const includeSwitch = (
    <Switch
      id="export-include-attachments"
      checked={includeAttachments}
      onCheckedChange={setIncludeAttachments}
    />
  );

  const importControls = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 清空以便再次选择同一个文件
          event.target.value = '';
          if (file) importFlow.start(file);
        }}
      />
      <DataImportDialog flow={importFlow} />
    </>
  );
  const chooseFile = () => fileInput.current?.click();

  if (mobileNav) {
    return (
      <SettingsPage>
        <SettingsGroup header={t('settings:exportData')} footer={t('settings:exportDescription')}>
          <SettingsRow
            label={t('settings:exportIncludeAttachments')}
            description={t('settings:exportIncludeAttachmentsHint')}
            htmlFor="export-include-attachments"
            control={includeSwitch}
          />
          <SettingsRow
            action
            disabled={exportMutation.isPending}
            onClick={() => void handleExport()}
            label={exportMutation.isPending ? t('settings:exporting') : t('settings:exportButton')}
          />
        </SettingsGroup>
        <SettingsGroup header={t('settings:importData')} footer={t('settings:importDescription')}>
          <SettingsRow
            action
            disabled={importFlow.busy}
            onClick={chooseFile}
            label={t('settings:importButton')}
          />
        </SettingsGroup>
        {importControls}
      </SettingsPage>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('settings:exportData')}</Label>
        <p className="text-sm text-muted-foreground">{t('settings:exportDescription')}</p>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="export-include-attachments">
            {t('settings:exportIncludeAttachments')}
          </Label>
          {includeSwitch}
        </div>
        <p className="text-sm text-muted-foreground">
          {t('settings:exportIncludeAttachmentsHint')}
        </p>
      </div>
      <Button onClick={handleExport} disabled={exportMutation.isPending} className="w-fit">
        {exportMutation.isPending ? t('settings:exporting') : t('settings:exportButton')}
      </Button>
      <div className="mt-4 flex flex-col gap-2">
        <Label>{t('settings:importData')}</Label>
        <p className="text-sm text-muted-foreground">{t('settings:importDescription')}</p>
      </div>
      <Button variant="outline" onClick={chooseFile} disabled={importFlow.busy} className="w-fit">
        {t('settings:importButton')}
      </Button>
      {importControls}
    </div>
  );
}
