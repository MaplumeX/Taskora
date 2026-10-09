import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { ActionSheetItem, ActionSheetSeparator } from '@/components/ui/action-sheet';
import { MenuRow } from './MenuRow';

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** 不可用原因等提示（仅桌面浮层显示）。 */
  title?: string;
  destructive?: boolean;
  /** 前面加分隔线。 */
  separated?: boolean;
}

/**
 * 同一组菜单项的两种形态：桌面浮层里的紧凑 MenuRow，或窄屏底部动作面板
 * （ActionSheet）里的整行大触控目标。sheet 形态须渲染在 ActionSheetContent 内。
 */
export function MenuItems({
  items,
  sheet = false,
  firstItemRef,
}: {
  items: MenuItem[];
  sheet?: boolean;
  firstItemRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <>
      {items.map(({ icon, label, onSelect, disabled, title, destructive, separated }, index) => (
        <React.Fragment key={label}>
          {separated &&
            (sheet ? <ActionSheetSeparator /> : <div className="-mx-1 my-1 h-px bg-muted" />)}
          {sheet ? (
            <ActionSheetItem
              ref={index === 0 ? firstItemRef : undefined}
              icon={icon}
              destructive={destructive}
              disabled={disabled}
              onClick={onSelect}
            >
              {label}
            </ActionSheetItem>
          ) : (
            <MenuRow
              ref={index === 0 ? firstItemRef : undefined}
              icon={icon}
              destructive={destructive}
              disabled={disabled}
              title={title}
              onClick={onSelect}
            >
              {label}
            </MenuRow>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
