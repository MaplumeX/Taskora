import { useEffect, useId, useState, type KeyboardEvent } from 'react';

/**
 * 「输入框 + 候选列表」的键盘导航（MovePicker / When 输入共用）：`↑`/`↓`
 * 循环移动高亮，`Enter` 选中；IME 组合输入期间忽略按键；高亮项滚入视野。
 * ARIA 由调用方用 `listboxId` / `optionId` 接到 combobox 与 option 上。
 */
export function useListboxNavigation<T>(items: readonly T[], onSelect: (item: T) => void) {
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listboxId]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((active + step + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item !== undefined) onSelect(item);
    }
  };

  return { listboxId, active, setActiveIndex, optionId, onKeyDown };
}
