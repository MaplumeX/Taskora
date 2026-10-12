import { useTranslation } from 'react-i18next';

import {
  checkForUpdates,
  getAppVersion,
  getUpdateShell,
  selectPendingUpdate,
  useUpdateStore,
  type UpdateShell,
} from '@taskora/api';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { SettingsGroup, SettingsPage, SettingsRow, useSettingsNav } from './SettingsList';

/** 更新检查结论的一行说明；从未检查过时为 null。 */
function useUpdateStatusText(): string | null {
  const { t } = useTranslation('settings');
  const verdict = useUpdateStore((s) => s.verdict);
  const readyVersion = useUpdateStore((s) => s.readyVersion);
  const checking = useUpdateStore((s) => s.checking);
  const failed = useUpdateStore((s) => s.failed);

  if (checking) return t('updateChecking');
  if (failed) return t('updateCheckFailed');
  if (!verdict) return null;
  switch (verdict.kind) {
    case 'up-to-date':
      return t('updateUpToDate');
    case 'hub-too-old':
      return t('updateHubTooOld');
    case 'update-available':
    case 'client-too-old': {
      const version = verdict.hubVersion;
      if (!version) return t('updateRequiredUnknown');
      if (readyVersion !== version) return t('updateNotReady', { version });
      return t(verdict.kind === 'client-too-old' ? 'updateRequired' : 'updateAvailable', {
        version,
      });
    }
  }
}

/**
 * 更新设置（ADR-0026）：仅注册了平台壳的客户端（桌面端 / Android）渲染。
 * 更新目标是所连服务器的版本，所以同时显示服务器版本。
 */
function useUpdateSettings(shell: UpdateShell) {
  const autoCheck = useUpdateStore((s) => s.autoCheck);
  const setAutoCheck = useUpdateStore((s) => s.setAutoCheck);
  const checking = useUpdateStore((s) => s.checking);
  const verdict = useUpdateStore((s) => s.verdict);
  const readyVersion = useUpdateStore((s) => s.readyVersion);
  // 设置页里被跳过的版本也可以安装
  const pending = selectPendingUpdate({ verdict, readyVersion, skippedVersion: null });
  const hubVersion = verdict && 'hubVersion' in verdict ? verdict.hubVersion : undefined;
  return {
    autoCheck,
    setAutoCheck,
    checking,
    hubVersion,
    pending,
    statusText: useUpdateStatusText(),
    checkNow: () => void checkForUpdates({ manual: true }),
    install: (version: string) => void shell.apply(version),
  };
}

function MobileUpdateGroup({ shell }: { shell: UpdateShell }) {
  const { t } = useTranslation('settings');
  const u = useUpdateSettings(shell);
  return (
    <SettingsGroup footer={u.statusText ?? t('autoCheckUpdatesHint')}>
      <SettingsRow label={t('serverVersion')} value={u.hubVersion ?? '—'} />
      <SettingsRow
        label={t('autoCheckUpdates')}
        htmlFor="auto-check-updates"
        control={
          <Switch id="auto-check-updates" checked={u.autoCheck} onCheckedChange={u.setAutoCheck} />
        }
      />
      {u.pending && (
        <SettingsRow
          label={t('updateInstall', { version: u.pending.version })}
          action
          onClick={() => u.install(u.pending!.version)}
        />
      )}
      <SettingsRow
        label={t('checkForUpdatesNow')}
        action
        disabled={u.checking}
        onClick={u.checkNow}
      />
    </SettingsGroup>
  );
}

function DesktopUpdateSection({ shell }: { shell: UpdateShell }) {
  const { t } = useTranslation('settings');
  const u = useUpdateSettings(shell);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('serverVersion')}</Label>
        <p className="text-sm">{u.hubVersion ?? '—'}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="auto-check-updates">{t('autoCheckUpdates')}</Label>
          <Switch id="auto-check-updates" checked={u.autoCheck} onCheckedChange={u.setAutoCheck} />
        </div>
        <p className="text-sm text-muted-foreground">{t('autoCheckUpdatesHint')}</p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={u.checking} onClick={u.checkNow}>
            {t('checkForUpdatesNow')}
          </Button>
          {u.pending && (
            <Button size="sm" onClick={() => u.install(u.pending!.version)}>
              {t('updateInstall', { version: u.pending.version })}
            </Button>
          )}
        </div>
        {u.statusText && <p className="text-sm text-muted-foreground">{u.statusText}</p>}
      </div>
    </>
  );
}

export default function SettingsAbout() {
  const { t } = useTranslation('settings');
  const mobileNav = useSettingsNav();
  const updateShell = getUpdateShell();

  if (mobileNav) {
    return (
      <SettingsPage>
        <SettingsGroup>
          <SettingsRow label={t('appName')} value="Taskora" />
          <SettingsRow label={t('appVersion')} value={getAppVersion()} />
          <SettingsRow label={t('techStack')} description={t('techStackValue')} />
        </SettingsGroup>
        {updateShell && <MobileUpdateGroup shell={updateShell} />}
      </SettingsPage>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('appName')}</Label>
        <p className="text-lg font-semibold">Taskora</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('appVersion')}</Label>
        <p className="text-sm">{getAppVersion()}</p>
      </div>
      {updateShell && <DesktopUpdateSection shell={updateShell} />}
      <div className="flex flex-col gap-1">
        <Label className="text-muted-foreground">{t('techStack')}</Label>
        <p className="text-sm">{t('techStackValue')}</p>
      </div>
    </div>
  );
}
