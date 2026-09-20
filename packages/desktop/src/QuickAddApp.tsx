/**
 * Floating quick-add window (global shortcut → type a task title → Enter).
 *
 * Pure text input: the text becomes the task title (no natural-language
 * date parsing in V1). Tasks land in the Inbox bucket by default.
 *
 * Window behavior (see src-tauri/src/lib.rs): shown/focused by the global
 * shortcut handler, hidden on blur and on submit; the typed text survives
 * hide/show cycles because the webview is never destroyed — Esc is the
 * explicit "discard and close" action.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { i18n, useAuthStore } from '@taskora/api';
import { bootQuickAdd } from './quickAddBoot';
import { QUICK_ADD_SUBMIT_EVENT } from './quick-add-relay';

async function showMainWindow() {
  const main = await WebviewWindow.getByLabel('main');
  if (main) {
    await main.show().catch(() => undefined);
    await main.setFocus().catch(() => undefined);
  }
  await getCurrentWindow().hide();
}

export function QuickAddApp() {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const authToken = useAuthStore((s) => s.token);

  const hideWindow = () => {
    void getCurrentWindow().hide();
  };

  // Focus the input whenever the shortcut re-opens the window.
  useEffect(() => {
    const unlisten = listen('quick-add://open', () => {
      void bootQuickAdd()
        .then(async () => {
          if (!useAuthStore.getState().token) {
            await showMainWindow();
            return;
          }
          inputRef.current?.focus();
          inputRef.current?.select();
        })
        .catch(() => {
          useAuthStore.setState({ token: null, user: null });
          void showMainWindow();
        });
    });

    inputRef.current?.focus();
    return () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 事件中继（V2）：标题发给主窗口，由其单一 Engine 实例创建任务
      // （进 Outbox，断网可用）；与主窗口看到的是同一份数据。fire-and-
      // forget：失败由主窗口呈现，不在本窗口阻塞。
      await emitTo('main', QUICK_ADD_SUBMIT_EVENT, { title: trimmed });
      setTitle('');
      hideWindow();
    } catch {
      setError(i18n.t('task:quickAddFailed', { defaultValue: 'Could not create the task' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background px-3 shadow-lift">
      <form onSubmit={handleSubmit} className="w-full">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setTitle('');
              hideWindow();
            }
          }}
          placeholder={t('task:quickAddPlaceholder', {
            defaultValue: 'Add a task to Inbox…',
          })}
          autoFocus
          className="h-12 w-full rounded-xl border border-border/60 bg-card px-4 text-base shadow-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary"
        />
        {error && <p className="mt-1 px-1 text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}
