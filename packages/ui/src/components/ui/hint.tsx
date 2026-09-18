/**
 * 按钮 hint 提示：hover（或键盘聚焦）时在按钮上方浮出小气泡，
 * 展示操作文案，可选附带平台对应快捷键（Things 风格）。
 *
 * 快捷键文案与 keymap registry 同源（shortcutLabel），不在调用处硬编码。
 */

import * as React from 'react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { detectKeyPlatform, shortcutLabel, type HintableAction, type KeyPlatform } from '@/components/keyboard/keymap';

interface HintProps {
  /** 提示文案（与按钮 aria-label 同源）。 */
  label: string;
  /** keymap 动作：自动按平台解析键位文案（如 ⌘N / Ctrl+N / Alt+N）。 */
  action?: HintableAction;
  /** 直接指定键位文案（无对应 keymap 动作时使用）。 */
  shortcut?: string;
  /** 浮层方向，默认上方。 */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** 平台，默认自动检测；测试可注入。 */
  platform?: KeyPlatform;
  children: React.ReactElement;
}

export function Hint({ label, action, shortcut, side = 'top', platform, children }: HintProps) {
  const resolvedShortcut =
    shortcut ?? (action ? shortcutLabel(action, platform ?? detectKeyPlatform()) : null);

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={cn(!resolvedShortcut && 'px-2.5')}>
          <span>{label}</span>
          {resolvedShortcut && (
            <kbd className="ml-2 rounded bg-background/20 px-1 py-0.5 font-sans text-[11px] leading-none">
              {resolvedShortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
