import { todayDateKey, useExportData } from '@taskora/api';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { SettingsGroup, SettingsPage, SettingsRow, useSettingsNav } from './SettingsList';

export default function SettingsData() {
  const { t } = useTranslation(['settings', 'common']);
  const exportMutation = useExportData();
  const mobileNav = useSettingsNav();

  const handleExport = async () => {
    try {
      const data = await exportMutation.mutateAsync();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taskora-export-${todayDateKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings:exportSuccess'));
    } catch {
      toast.error(t('settings:exportFailed'));
    }
  };

  if (mobileNav) {
    return (
      <SettingsPage>
        <SettingsGroup header={t('settings:exportData')} footer={t('settings:exportDescription')}>
          <SettingsRow
            action
            disabled={exportMutation.isPending}
            onClick={() => void handleExport()}
            label={exportMutation.isPending ? t('settings:exporting') : t('settings:exportButton')}
          />
        </SettingsGroup>
      </SettingsPage>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('settings:exportData')}</Label>
        <p className="text-sm text-muted-foreground">{t('settings:exportDescription')}</p>
      </div>
      <Button onClick={handleExport} disabled={exportMutation.isPending} className="w-fit">
        {exportMutation.isPending ? t('settings:exporting') : t('settings:exportButton')}
      </Button>
    </div>
  );
}
