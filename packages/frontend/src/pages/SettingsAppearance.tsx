import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { UpdatePreferencesDto } from '@taskora/shared';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  usePreferencesStore,
  type Language,
  type ThemeMode,
  type WeekStartsOn,
} from '@/lib/stores/preferences.store';
import { useUpdatePreferences } from '@/lib/hooks/useUsers';

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
  const theme = usePreferencesStore((s) => s.theme);
  const language = usePreferencesStore((s) => s.language);
  const weekStartsOn = usePreferencesStore((s) => s.weekStartsOn);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const setLanguage = usePreferencesStore((s) => s.setLanguage);
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

  // Optimistic update with rollback: capture the previous triple so a failed
  // server sync restores local state instead of leaving a silent divergence.
  const withRollback = (apply: () => void, payload: UpdatePreferencesDto) => {
    const { theme: prevTheme, language: prevLanguage, weekStartsOn: prevWeekStartsOn } =
      usePreferencesStore.getState();
    apply();
    updatePreferences.mutate(payload, {
      onError: () => {
        // Restore the exact prior triple so local and server stay consistent.
        usePreferencesStore.getState().setTheme(prevTheme);
        usePreferencesStore.getState().setLanguage(prevLanguage);
        usePreferencesStore.getState().setWeekStartsOn(prevWeekStartsOn);
        syncError();
      },
    });
  };

  const handleChangeTheme = (value: ThemeMode) => {
    withRollback(() => setTheme(value), { theme: value });
  };

  const handleChangeLanguage = (value: Language) => {
    withRollback(() => setLanguage(value), { language: value });
  };

  const handleChangeWeekStartsOn = (value: WeekStartsOn) => {
    withRollback(() => setWeekStartsOn(value), { weekStartsOn: value });
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
              active={theme === opt.value}
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
              active={language === opt.value}
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