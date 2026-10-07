import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import ReminderReliabilitySection from './ReminderReliabilitySection';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  useSettingsNav,
  SettingsRadio,
} from './SettingsList';
import {
  currentStatusBarController,
  getClientKind,
  getNotificationShell,
  usePreferencesStore,
  useUpdatePreferences,
} from '@taskora/api';

/**
 * 开机自启走桌面壳 Rust 命令（launch_at_login.rs）而非 autostart 插件
 * guest-js：壳层会持久化用户意图，启动时补回被安装包覆盖安装删掉的
 * 登录项。invoke 按需动态 import，不进入 web 端运行路径。
 */
const invokeShell = async <T,>(cmd: string, args?: Record<string, unknown>) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
};

/**
 * 桌面端专属系统设置（如开机自启）只在桌面 Tauri 运行时出现。
 * 注意：移动端同样是 Tauri shell（webview 里也会注入 __TAURI_INTERNALS__），
 * 所以仅靠 __TAURI_INTERNALS__ 无法区分桌面与移动，必须同时校验 clientKind。
 */
const isDesktopRuntime = () => '__TAURI_INTERNALS__' in globalThis && getClientKind() === 'desktop';

/** 状态栏常驻通知（android-status-bar）：仅 Android 渲染，且控制器已注册。 */
const getStatusBar = () => (getClientKind() === 'mobile' ? currentStatusBarController() : null);

/** 提醒可靠性（ADR-0014）：仅实现了投递诊断的通知薄壳（Android）渲染。 */
const getReliabilityShell = () => {
  const shell = getNotificationShell();
  return shell?.reliability && shell.openSystemSettings ? shell : null;
};

const formatZone = (zone: string) => zone.replaceAll('_', ' ');

/** 窄屏时区选项页：顶部搜索框 + ✓ 列表，选中后返回上一级。 */
function TimeZonePicker({
  zones,
  onSelect,
}: {
  zones: string[];
  onSelect: (zone: string) => void;
}) {
  const { t } = useTranslation('settings');
  const current = usePreferencesStore((s) => s.timeZone);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase().replaceAll(' ', '_');
  const filtered = q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones;

  // 打开时把当前时区滚到视口中间（列表按字母序有数百项）。
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  return (
    <SettingsPage>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('timeZoneSearch')}
        aria-label={t('timeZoneSearch')}
        className="h-12 w-full rounded-full bg-card px-5 text-base outline-none placeholder:text-muted-foreground"
      />
      <SettingsGroup>
        {filtered.length === 0 ? (
          <SettingsRow label={<span className="text-muted-foreground">{t('noMatches')}</span>} />
        ) : (
          filtered.map((zone) => (
            <button
              key={zone}
              ref={zone === current ? currentRef : undefined}
              type="button"
              role="radio"
              aria-checked={zone === current}
              onClick={() => onSelect(zone)}
              className="flex min-h-14 w-full items-center gap-4 px-4 py-2 text-left text-base transition-colors active:bg-accent"
            >
              <SettingsRadio checked={zone === current} />
              <span className="min-w-0 flex-1 truncate">{formatZone(zone)}</span>
            </button>
          ))
        )}
      </SettingsGroup>
    </SettingsPage>
  );
}

/**
 * 「通用」设置页。
 *
 * - 「在时间视图中按项目/区域分组任务」：全平台可见，随用户偏好跨设备同步
 *   （与主题/语言同一管线）。
 * - 「登录时自动启动」：仅桌面端（Tauri）渲染，经壳层 launch_at_login
 *   命令读写（见 invokeShell）。
 */
export default function SettingsGeneral() {
  const { t } = useTranslation(['settings', 'common']);
  const mobileNav = useSettingsNav();
  const desktop = isDesktopRuntime();
  // null = 初始加载中（开关禁用）；boolean = 系统登录项当前状态。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  const timeZone = usePreferencesStore((s) => s.timeZone);
  const zones = Array.from(
    new Set([
      timeZone,
      'UTC',
      ...(typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : [
            'Asia/Shanghai',
            'Asia/Tokyo',
            'Europe/London',
            'America/New_York',
            'America/Los_Angeles',
          ]),
    ]),
  ).sort();
  const handleTimeZoneChange = (zone: string) => {
    const previous = usePreferencesStore.getState().timeZone;
    usePreferencesStore.getState().setTimeZone(zone);
    updatePreferences.mutate(
      { timeZone: zone },
      {
        onError: () => {
          usePreferencesStore.getState().setTimeZone(previous);
          toast.error(t('common:saveFailed'));
        },
      },
    );
  };

  const bucketGrouping = usePreferencesStore((s) => s.bucketGrouping);
  const setBucketGrouping = usePreferencesStore((s) => s.setBucketGrouping);
  const updatePreferences = useUpdatePreferences();

  // 状态栏常驻通知（Android）：控制器在 mobile init 时注册；初始值同步读取。
  const statusBar = getStatusBar();
  const [statusBarEnabled, setStatusBarEnabled] = useState(() =>
    statusBar ? statusBar.isEnabled() : null,
  );
  const [statusBarPending, setStatusBarPending] = useState(false);
  const reliabilityShell = getReliabilityShell();

  const handleStatusBarChange = async (next: boolean) => {
    if (!statusBar || statusBarPending) return;
    setStatusBarPending(true);
    try {
      const applied = await statusBar.setEnabled(next);
      if (next && !applied) {
        // 权限被拒：不开，引导文案提示去系统设置授权。
        toast.error(t('settings:statusBarPermissionDenied'));
        return;
      }
    } catch (error) {
      console.warn('[status-bar] setting failed:', error);
      toast.error(t('settings:statusBarFailed'));
    } finally {
      setStatusBarEnabled(statusBar.isEnabled());
      setStatusBarPending(false);
    }
  };

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    invokeShell<boolean>('launch_at_login_get')
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
      await invokeShell('launch_at_login_set', { enabled: next });
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

  if (mobileNav) {
    // 窄屏：列表单元格（时区推入搜索选项页，开关放行内，说明作分组脚注）
    return (
      <SettingsPage>
        <SettingsGroup footer={t('settings:timeZoneHint')}>
          <SettingsRow
            label={t('settings:timeZone')}
            value={formatZone(timeZone)}
            onClick={() =>
              mobileNav.push({
                title: t('settings:timeZone'),
                render: () => (
                  <TimeZonePicker
                    zones={zones}
                    onSelect={(zone) => {
                      handleTimeZoneChange(zone);
                      mobileNav.pop();
                    }}
                  />
                ),
              })
            }
          />
        </SettingsGroup>

        <SettingsGroup footer={t('settings:groupTasksByParentHint')}>
          <SettingsRow
            label={t('settings:groupTasksByParent')}
            htmlFor="bucket-grouping"
            control={
              <Switch
                id="bucket-grouping"
                checked={bucketGrouping}
                onCheckedChange={handleGroupingChange}
              />
            }
          />
        </SettingsGroup>

        {statusBar && statusBarEnabled !== null && (
          <SettingsGroup footer={t('settings:statusBarHint')}>
            <SettingsRow
              label={t('settings:statusBar')}
              htmlFor="status-bar"
              control={
                <Switch
                  id="status-bar"
                  checked={statusBarEnabled}
                  disabled={statusBarPending}
                  onCheckedChange={handleStatusBarChange}
                />
              }
            />
          </SettingsGroup>
        )}

        {reliabilityShell && <ReminderReliabilitySection shell={reliabilityShell} />}
      </SettingsPage>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="account-time-zone">{t('settings:timeZone')}</Label>
        <select
          id="account-time-zone"
          value={timeZone}
          disabled={updatePreferences.isPending}
          onChange={(event) => handleTimeZoneChange(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {formatZone(zone)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{t('settings:timeZoneHint')}</p>
      </div>

      {/* 在时间视图中按项目/区域分组任务 */}
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

      {/* 状态栏快速添加（仅 Android） */}
      {statusBar && statusBarEnabled !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="status-bar">{t('settings:statusBar')}</Label>
            <Switch
              id="status-bar"
              checked={statusBarEnabled}
              disabled={statusBarPending}
              onCheckedChange={handleStatusBarChange}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t('settings:statusBarHint')}</p>
        </div>
      )}

      {/* 提醒可靠性（仅 Android） */}
      {reliabilityShell && <ReminderReliabilitySection shell={reliabilityShell} />}

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
