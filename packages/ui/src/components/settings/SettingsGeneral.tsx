import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { usePreferencesStore, useUpdatePreferences } from '@taskora/api';

type AutoStartApi = {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

/** 桌面端专属系统设置（如开机自启）只在 Tauri 运行时出现，Web 版不渲染。 */
const isDesktopRuntime = () => '__TAURI_INTERNALS__' in globalThis;

/**
 * 「通用」设置页。
 *
 * - 「在时间视图中按项目/领域分组任务」：全平台可见，随用户偏好跨设备同步
 *   （与主题/语言同一管线）。
 * - 「登录时自动启动」：仅桌面端（Tauri）渲染，autostart 插件按需动态
 *   import，不进入 web 端运行路径。
 */
export default function SettingsGeneral() {
  const { t } = useTranslation(['settings', 'common']);
  const desktop = isDesktopRuntime();
  // null = 初始加载中（开关禁用）；boolean = 系统登录项当前状态。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const bucketGrouping = usePreferencesStore((s) => s.bucketGrouping);
  const setBucketGrouping = usePreferencesStore((s) => s.setBucketGrouping);
  const updatePreferences = useUpdatePreferences();

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    import('@tauri-apps/plugin-autostart')
      .then((m: AutoStartApi) => m.isEnabled())
      .then((v) => {
        if (!cancelled) setEnabled(v);
      })
      .catch(() => {
        // 读取失败（权限/平台问题）：显示为关闭，允许用户重试开启。
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  const handleChange = async (next: boolean) => {
    if (pending) return;
    setPending(true);
    try {
      const m = (await import('@tauri-apps/plugin-autostart')) as AutoStartApi;
      if (next) {
        await m.enable();
      } else {
        await m.disable();
      }
      setEnabled(next);
    } catch {
      toast.error(t('settings:launchAtLoginFailed'));
    } finally {
      setPending(false);
    }
  };

  // 与 SettingsAppearance 同一惯例：本地乐观更新 + 失败回滚。
  const handleGroupingChange = (next: boolean) => {
    const prev = usePreferencesStore.getState().bucketGrouping;
    setBucketGrouping(next);
    updatePreferences.mutate(
      { bucketGrouping: next },
      {
        onError: () => {
          usePreferencesStore.getState().setBucketGrouping(prev);
          toast.error(t('common:saveFailed'));
        },
      },
    );
  };

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {/* 在时间视图中按项目/领域分组任务 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="bucket-grouping">{t('settings:groupTasksByParent')}</Label>
          <Switch
            id="bucket-grouping"
            checked={bucketGrouping}
            onCheckedChange={handleGroupingChange}
          />
        </div>
        <p className="text-sm text-muted-foreground">{t('settings:groupTasksByParentHint')}</p>
      </div>

      {/* 登录时自动启动（仅桌面端） */}
      {desktop && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="launch-at-login">{t('settings:launchAtLogin')}</Label>
            <Switch
              id="launch-at-login"
              checked={enabled === true}
              disabled={enabled === null || pending}
              onCheckedChange={handleChange}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t('settings:launchAtLoginHint')}</p>
        </div>
      )}
    </div>
  );
}
