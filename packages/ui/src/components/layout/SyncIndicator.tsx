import { useTranslation } from 'react-i18next';
import { CircleArrowUp, CloudOff, Cloud, Loader2 } from 'lucide-react';

import { useSyncStatusStore } from '@taskora/api';

/**
 * 同步状态指示器（V2 spec：离线可见性）。
 *
 * 常驻角落、只呈现状态、不拦截任何操作（无阻塞式 UI、无逐任务标注）。
 * 状态由桌面端 syncNow 的成败驱动；web 端无 Engine，状态恒为 idle →
 * 不渲染。离线时显示 Outbox 中未同步的写操作条数。需要升级（hub 要求
 * 更高的同步协议版本，或副本来自更新版本）时常驻提示，直到安装新版本。
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const status = useSyncStatusStore((s) => s.status);
  const pendingCount = useSyncStatusStore((s) => s.pendingCount);

  if (status === 'idle') return null; // web：无 Engine，无可指示的状态

  if (status === 'offline') {
    return (
      <div
        role="status"
        data-sync-status="offline"
        className="pointer-events-none fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] right-3 z-40 max-md:bottom-[calc(1.75rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] max-md:right-auto max-md:left-3 flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive backdrop-blur-sm"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>{t('common:syncStatusOffline', { count: pendingCount })}</span>
      </div>
    );
  }

  if (status === 'upgrade-required') {
    return (
      <div
        role="status"
        data-sync-status="upgrade-required"
        className="pointer-events-none fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] right-3 z-40 max-md:bottom-[calc(1.75rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] max-md:right-auto max-md:left-3 flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive backdrop-blur-sm"
      >
        <CircleArrowUp className="h-3.5 w-3.5" />
        <span>{t('common:syncStatusUpgradeRequired')}</span>
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div
        role="status"
        data-sync-status="syncing"
        className="pointer-events-none fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] right-3 z-40 max-md:bottom-[calc(1.75rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] max-md:right-auto max-md:left-3 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t('common:syncStatusSyncing')}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-sync-status="synced"
      className="pointer-events-none fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] right-3 z-40 max-md:bottom-[calc(1.75rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] max-md:right-auto max-md:left-3 flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground/70 backdrop-blur-sm"
    >
      <Cloud className="h-3 w-3" />
      <span>{t('common:syncStatusSynced')}</span>
    </div>
  );
}
