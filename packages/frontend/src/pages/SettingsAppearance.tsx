import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useTheme, type ThemeMode } from '@/lib/hooks/useTheme';
import { usePreferencesStore } from '@/lib/stores/preferences.store';
import { useUpdatePreferences } from '@/lib/hooks/useUsers';
import { i18n } from '@/i18n/config';

type Language = 'zh' | 'en';
type WeekStartsOn = 0 | 1;

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-transparent hover:bg-accent border-border',
      )}
    >
      {children}
    </button>
  );
}

export default function SettingsAppearance() {
  const { t } = useTranslation(['settings', 'theme', 'common']);
  const { mode, setMode } = useTheme();
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const setWeekStartsOn = usePreferencesStore((s) => s.setWeekStartsOn);
  const updatePreferences = useUpdatePreferences();

  const themes: { value: ThemeMode; labelKey: string }[] = [
    { value: 'light', labelKey: 'theme:light' },
    { value: 'dark', labelKey: 'theme:dark' },
    { value: 'system', labelKey: 'theme:system' },
  ];

  const languages: { value: Language; label: string }[] = [
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
  ];

  const weekOptions: { value: WeekStartsOn; labelKey: string }[] = [
    { value: 0, labelKey: 'settings:sunday' },
    { value: 1, labelKey: 'settings:monday' },
  ];

  const syncError = () => toast.error(t('common:saveFailed'));

  const handleChangeTheme = (value: ThemeMode) => {
    setMode(value);
    updatePreferences.mutate({ theme: value }, { onError: syncError });
  };

  const handleChangeLanguage = (value: Language) => {
    void i18n.changeLanguage(value);
    updatePreferences.mutate({ language: value }, { onError: syncError });
  };

  const handleChangeWeekStartsOn = (value: WeekStartsOn) => {
    setWeekStartsOn(value);
    updatePreferences.mutate({ weekStartsOn: value }, { onError: syncError });
  };

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {/* 主题 */}
      <div className="flex flex-col gap-2">
        <Label>{t('settings:theme')}</Label>
        <div className="flex gap-1">
          {themes.map((opt) => (
            <OptionButton
              key={opt.value}
              active={mode === opt.value}
              onClick={() => handleChangeTheme(opt.value)}
            >
              {t(opt.labelKey)}
            </OptionButton>
          ))}
        </div>
      </div>

      {/* 语言 */}
      <div className="flex flex-col gap-2">
        <Label>{t('settings:language')}</Label>
        <div className="flex gap-1">
          {languages.map((opt) => (
            <OptionButton
              key={opt.value}
              active={i18n.language === opt.value}
              onClick={() => handleChangeLanguage(opt.value)}
            >
              {opt.label}
            </OptionButton>
          ))}
        </div>
      </div>

      {/* 每周起始日 */}
      <div className="flex flex-col gap-2">
        <Label>{t('settings:weekStartsOn')}</Label>
        <div className="flex gap-1">
          {weekOptions.map((opt) => (
            <OptionButton
              key={opt.value}
              active={weekStartsOn === opt.value}
              onClick={() => handleChangeWeekStartsOn(opt.value)}
            >
              {t(opt.labelKey)}
            </OptionButton>
          ))}
        </div>
      </div>
    </div>
  );
}