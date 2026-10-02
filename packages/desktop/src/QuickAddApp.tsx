/**
 * Floating quick-add window (global shortcut → type a task title → Enter).
 *
 * Submits a QuickAddDraft to the main window (quick-add-relay), which
 * creates it through the shared createFromQuickAddDraft. On every open the
 * window pulls a fresh data snapshot from the main window (quick-add-client)
 * for the field pickers. Tasks land in the Inbox by default.
 *
 * Window behavior (see src-tauri/src/lib.rs): a transparent, undecorated
 * window that only paints the card; shown/focused by the global shortcut
 * handler, hidden on blur, on submit and on clicks in the transparent area; the typed text survives
 * hide/show cycles because the webview is never destroyed — Esc is the
 * explicit "discard and close" action. The card itself is QuickAddCard
 * (packages/ui), shared layout with the expanded task row.
 */
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { i18n, useAuthStore, type QuickAddDraft } from '@taskora/api';
import { QuickAddCard, type QuickAddCardHandle } from '@taskora/ui/components/task/QuickAddCard';
import { cn } from '@taskora/ui/lib/utils';
import { bootQuickAdd } from './quickAddBoot';
import { onQuickAddResult, refreshQuickAddData, submitQuickAddDraft } from './quick-add-client';

async function showMainWindow() {
  const main = await WebviewWindow.getByLabel('main');
  if (main) {
    await main.show().catch(() => undefined);
    await main.setFocus().catch(() => undefined);
  }
  await getCurrentWindow().hide();
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 进场：淡入并轻微下落（Web Animations，不重挂卡片，草稿不丢）。 */
function playEnter(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return;
  el.animate(
    [
      { opacity: 0, transform: 'translateY(-8px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 150, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  );
}

/** 出场：淡出后再隐藏窗口；动画结束即撤销，下次显示从正常状态开始。 */
async function playExit(el: HTMLElement | null) {
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return;
  const animation = el.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(-4px)' },
    ],
    { duration: 100, easing: 'ease-in', fill: 'forwards' },
  );
  await animation.finished.catch(() => undefined);
  // 窗口隐藏后再撤销 fill，避免隐藏前闪回一帧
  requestAnimationFrame(() => animation.cancel());
}

/** 是否有字段选择器（Radix Popover）开着：开着时点空白处只关选择器。 */
const pickerOpen = () => !!document.querySelector('[data-radix-popper-content-wrapper]');

export function QuickAddApp() {
  const [error, setError] = useState<string | null>(null);
  /** 「添加并继续」后的短暂提示（已添加到 X）。 */
  const [notice, setNotice] = useState<string | null>(null);
  /** 「添加并继续」的提交：窗口仍开着，回执在本窗口呈现。 */
  const continuedRequests = useRef(new Set<string>());
  const cardRef = useRef<QuickAddCardHandle>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const authToken = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const hideWindow = async () => {
    await playExit(surfaceRef.current);
    await getCurrentWindow().hide();
  };

  // Focus the title whenever the shortcut re-opens the window.
  useEffect(() => {
    const unlisten = listen('quick-add://open', () => {
      void bootQuickAdd()
        .then(async () => {
          if (!useAuthStore.getState().token) {
            await showMainWindow();
            return;
          }
          playEnter(surfaceRef.current);
          cardRef.current?.focusTitle();
          void refreshQuickAddData(queryClient);
        })
        .catch(() => {
          useAuthStore.setState({ token: null, user: null });
          void showMainWindow();
        });
    });

    cardRef.current?.focusTitle();
    if (useAuthStore.getState().token) void refreshQuickAddData(queryClient);
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  // 主窗口回执：只呈现「添加并继续」的提交（其余提交时窗口已隐藏，
  // 失败由主窗口以 toast + 系统通知呈现）。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = onQuickAddResult((result) => {
      if (!result.requestId || !continuedRequests.current.delete(result.requestId)) return;
      if (!result.ok) {
        setError(i18n.t('task:quickAddFailed', { defaultValue: 'Could not create the task' }));
        return;
      }
      const place = result.placedIn.kind === 'inbox' ? i18n.t('nav:inbox') : result.placedIn.title;
      setNotice(i18n.t('task:quickAddAddedTo', { place }));
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 2500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Not signed in: focus the main window to run the guided setup/login
  // flow (issue 05 strategy), then hide this window out of the way.
  useEffect(() => {
    if (authToken) return;
    void showMainWindow();
  }, [authToken]);

  if (!authToken) {
    // Not signed in: quick add cannot work — the effect above already
    // focused the main window; this window hides itself.
    return null;
  }

  const handleSubmit = async (draft: QuickAddDraft, { keepOpen }: { keepOpen: boolean }) => {
    setError(null);
    try {
      // 事件中继（V2）：草稿发给主窗口，由其单一 Engine 实例创建任务
      // （进 Outbox，断网可用）；与主窗口看到的是同一份数据。fire-and-
      // forget：失败由主窗口以 toast + 系统通知呈现，不在本窗口阻塞。
      const requestId = await submitQuickAddDraft(draft);
      if (keepOpen) continuedRequests.current.add(requestId);
      else void hideWindow();
    } catch (cause) {
      setError(i18n.t('task:quickAddFailed', { defaultValue: 'Could not create the task' }));
      throw cause; // 卡片据此保留草稿
    }
  };

  // 透明窗口（quick-add-v2 issue 02）：卡片贴顶，下方透明区域留给弹出的
  // 字段选择器（窗口不随选择器伸缩）。点透明区域等同点到窗外：隐藏但保留
  // 草稿，与失焦隐藏同一语义；有选择器开着时只关选择器。
  return (
    <div
      className="h-screen px-4 pt-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pickerOpen()) void hideWindow();
      }}
    >
      <div ref={surfaceRef}>
        <QuickAddCard
          ref={cardRef}
          onSubmit={handleSubmit}
          onCancel={() => {
            setError(null);
            void hideWindow();
          }}
        />
        {(error || notice) && (
          <p
            role="status"
            className={cn(
              'mt-1.5 w-fit rounded-md bg-card px-2 py-1 text-xs shadow-sm',
              error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {error ?? notice}
          </p>
        )}
      </div>
    </div>
  );
}
