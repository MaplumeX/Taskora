import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type AutoStartApi = {
  isEnabled: () => Promise<boolean>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
};

/**
 * 桌面端「通用」设置页。当前只有一项：登录时自动启动。
 *
 * 组件仅会在 Tauri 运行时挂载（SettingsModal 按 isDesktopRuntime 过滤），
 * 因此可以放心地按需 import autostart 插件 —— 该模块不会进入 web 端
 * bundle，Web 版构建不解析 @tauri-apps/plugin-autostart。
 */
export default function SettingsGeneral() {
  const { t } = useTranslation(['settings', 'common']);
  // null = 初始加载中（开关禁用）；boolean = 系统登录项当前状态。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
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
  }, []);

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

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {/* 登录时自动启动 */}
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
    </div>
  );
}
