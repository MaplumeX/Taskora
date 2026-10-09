/**
 * Android 快速添加浮层的页面（QuickAddActivity 内嵌 WebView）。
 *
 * 卡片就是桌面 quick-add 窗口与展开任务同一张 QuickAddCard：标题、备注、
 * 字段栏（归属 / 计划日期 / Tag / 截止日期，窄屏选择器走居中卡片）。触屏
 * 没有快捷键，底部提示行换成按钮：在应用中继续 · 连续添加 · 添加。
 *
 * 透明区域点击 = 放弃并关闭（有选择器开着时只关选择器，与桌面一致）。
 */
import * as React from 'react';
import { Repeat, SquareArrowOutUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { QuickAddDraft } from '@taskora/api';
import {
  QuickAddCard,
  type QuickAddCardHandle,
  type QuickAddSubmitOptions,
} from '@taskora/ui/components/task/QuickAddCard';
import { Button } from '@taskora/ui/components/ui/button';
import { cn } from '@taskora/ui/lib/utils';

import type { QuickAddHost } from './host';

/** 连续添加开关（本机记忆；浮层 WebView 自己的 localStorage）。 */
export const CONTINUOUS_KEY = 'taskora-quick-add-continuous';
const NOTICE_MS = 1500;

/** 点按钮不抢标题的焦点：键盘保持弹出（连续添加时尤其要紧）。 */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

/** 是否有字段选择器（窄屏 Dialog / 宽屏 Popover）开着。 */
const pickerOpen = () =>
  !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');

/** 返回键：有选择器开着时以 Escape 关掉它（Radix 在 document 上监听）。 */
export function closeOpenPicker(): boolean {
  if (!pickerOpen()) return false;
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

function readContinuous(): boolean {
  try {
    return window.localStorage.getItem(CONTINUOUS_KEY) === '1';
  } catch {
    return false;
  }
}

export function QuickAddOverlay({ host }: { host: QuickAddHost }) {
  const { t } = useTranslation();
  const cardRef = React.useRef<QuickAddCardHandle>(null);
  const [continuous, setContinuous] = React.useState(readContinuous);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    cardRef.current?.focusTitle();
    host.ready();
  }, [host]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggleContinuous = () => {
    const next = !continuous;
    setContinuous(next);
    try {
      window.localStorage.setItem(CONTINUOUS_KEY, next ? '1' : '0');
    } catch {
      // 存不下只影响下次打开的默认值
    }
  };

  const handleSubmit = (draft: QuickAddDraft, { keepOpen, openInApp }: QuickAddSubmitOptions) => {
    if (openInApp) {
      host.submit(JSON.stringify({ ...draft, openInApp: true }), 'openInApp');
      return;
    }
    host.submit(JSON.stringify(draft), keepOpen ? 'continue' : 'close');
    if (keepOpen) setNotice(t('statusbar:quickAddAdded'));
  };

  return (
    <div
      className="h-full px-3 pt-14"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pickerOpen()) host.dismiss();
      }}
    >
      <QuickAddCard
        ref={cardRef}
        onSubmit={handleSubmit}
        onCancel={() => host.dismiss()}
        keepOpenOnEnter={continuous}
        footer={({ canSubmit, submit }) => (
          <div className="-mb-1 flex items-center gap-1 pl-6">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canSubmit}
              onClick={() => submit({ keepOpen: false, openInApp: true })}
              className="-ml-2.5 h-9 gap-1.5 px-2.5 text-muted-foreground"
            >
              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
              {t('statusbar:quickAddContinueInApp')}
            </Button>
            <span
              role="status"
              className="min-w-0 flex-1 truncate text-right text-meta text-muted-foreground"
            >
              {notice}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={continuous}
              onMouseDown={keepFocus}
              onClick={toggleContinuous}
              className={cn(
                'h-9 gap-1.5 px-2.5',
                continuous
                  ? 'bg-selection text-primary hover:bg-selection hover:text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <Repeat className="h-3.5 w-3.5" />
              {t('statusbar:quickAddContinuous')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              onMouseDown={keepFocus}
              onClick={() => submit({ keepOpen: continuous })}
              className="h-9 px-4 text-sm"
            >
              {t('statusbar:quickAddSubmit')}
            </Button>
          </div>
        )}
      />
    </div>
  );
}
