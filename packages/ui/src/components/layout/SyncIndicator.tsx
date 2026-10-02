import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleArrowUp, CloudOff } from 'lucide-react';

import { useAssistantUiStore, useSyncStatusStore } from '@taskora/api';
import { cn } from '@/lib/utils';

/**
 * 同步状态指示器（V2 spec：离线可见性）。
 *
 * 只在异常时出现在角落、不拦截任何操作（无阻塞式 UI、无逐任务标注）。
 * 状态由各端 Engine 同步调度（syncNow）的成败驱动；正常态（idle / 同步中 /
 * 已同步）不渲染，避免遮挡内容。离线时显示 Outbox 中未同步的写操作条数。需要升级（hub 要求
 * 更高的同步协议版本，或副本来自更新版本）时常驻提示，直到安装新版本。
 */
export function SyncIndicator() {
  const { t } = useTranslation();
  const status = useSyncStatusStore((s) => s.status);
  const pendingCount = useSyncStatusStore((s) => s.pendingCount);
  // 助手面板占住右侧时让到面板左边，不压住面板输入框。
  const panelOpen = useAssistantUiStore((s) => s.panelOpen);
  const panelWidth = useAssistantUiStore((s) => s.panelWidth);
  const className = cn(
    'pointer-events-none fixed bottom-[calc(0.75rem+var(--kb-inset,0px))] right-3 z-40 max-md:bottom-[calc(1.75rem+env(safe-area-inset-bottom)+var(--kb-inset,0px))] max-md:right-auto max-md:left-3 flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive backdrop-blur-sm',
    panelOpen && 'md:right-[calc(var(--assistant-panel-w)+0.75rem)]',
  );
  const style = { '--assistant-panel-w': `${panelWidth}px` } as CSSProperties;

  if (status === 'offline') {
    return (
      <div role="status" data-sync-status="offline" className={className} style={style}>
        <CloudOff className="h-3.5 w-3.5" />
        <span>{t('common:syncStatusOffline', { count: pendingCount })}</span>
      </div>
    );
  }

  if (status === 'upgrade-required') {
    return (
      <div role="status" data-sync-status="upgrade-required" className={className} style={style}>
        <CircleArrowUp className="h-3.5 w-3.5" />
        <span>{t('common:syncStatusUpgradeRequired')}</span>
      </div>
    );
  }

  return null; // idle / syncing / synced：正常态不打扰
}
