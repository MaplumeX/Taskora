import { useTranslation } from 'react-i18next';

import { Label } from '@/components/ui/label';

export default function SettingsAbout() {
  const { t } = useTranslation('settings');

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('appName')}</Label>
        <p className="text-lg font-semibold">Taskora</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('appVersion')}</Label>
        <p className="text-sm">0.1.4</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('techStack')}</Label>
        <p className="text-sm">{t('techStackValue')}</p>
      </div>
    </div>
  );
}