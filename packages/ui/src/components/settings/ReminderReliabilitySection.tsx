import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  useReminderPermissionStore,
  type ReminderNotificationShell,
  type ReminderReliabilityStatus,
} from '@taskora/api';

interface ReliabilityRow {
  id: string;
  label: string;
  ok: boolean;
  fix: () => Promise<unknown>;
}

/**
 * 「提醒可靠性」区（仅 Android，ADR-0014）：展示影响 Reminder 投递的系统
 * 状态，并提供跳转到对应系统设置页的入口。自启动无法检测，只给入口。
 * 从系统设置返回（focus / visibilitychange）时重新读取状态。
 */
export default function ReminderReliabilitySection({
  shell,
}: {
  shell: ReminderNotificationShell;
}) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<ReminderReliabilityStatus | null>(null);

  const refresh = useCallback(() => {
    shell
      .reliability?.()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [shell]);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

  if (!status) return null;

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      toast.error(t('reminderSettingsFailed'));
    } finally {
      refresh();
    }
  };

  const rows: ReliabilityRow[] = [
    {
      id: 'notifications',
      label: t('reminderNotifications'),
      ok: status.notifications,
      // 从未询问过时先弹系统授权框；已被拒（或 Android 13 以下）再跳设置页。
      fix: async () => {
        if (!(await useReminderPermissionStore.getState().request())) {
          await shell.openSettings();
        }
      },
    },
    {
      id: 'channel',
      label: t('reminderChannel'),
      ok: status.channelEnabled,
      fix: () => shell.openSettings(),
    },
    {
      id: 'exact-alarm',
      label: t('reminderExactAlarms'),
      ok: status.exactAlarms,
      fix: () => shell.openSystemSettings!('exact-alarm'),
    },
    {
      id: 'battery',
      label: t('reminderBattery'),
      ok: status.batteryUnrestricted,
      fix: () => shell.openSystemSettings!('battery'),
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('reminderReliability')}</Label>
      <p className="text-sm text-muted-foreground">{t('reminderReliabilityHint')}</p>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid={`reliability-${row.id}`}
            className="flex min-h-11 items-center justify-between gap-4 px-3 py-1.5 text-sm"
          >
            <span>{row.label}</span>
            {row.ok ? (
              <span className="text-muted-foreground">{t('reminderStatusOk')}</span>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void run(row.fix)}>
                {t('reminderStatusFix')}
              </Button>
            )}
          </li>
        ))}
        <li
          data-testid="reliability-autostart"
          className="flex min-h-11 items-center justify-between gap-4 px-3 py-1.5 text-sm"
        >
          <div className="flex flex-col">
            <span>{t('reminderAutostart')}</span>
            <span className="text-xs text-muted-foreground">{t('reminderAutostartHint')}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void run(() => shell.openSystemSettings!('autostart'))}
          >
            {t('reminderOpen')}
          </Button>
        </li>
      </ul>
    </div>
  );
}
