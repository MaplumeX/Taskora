import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';

import { useListboxNavigation } from '../../lib/useListboxNavigation';
import { cn } from '@/lib/utils';

interface Props<T extends { id: string }> {
  targets: T[];
  currentId: string | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (target: T) => void;
  searchPlaceholder: string;
  emptyMessage: string;
  renderTarget: (target: T) => ReactNode;
  isNested?: (target: T) => boolean;
  /** 列表的无障碍名称（默认「移动」）。 */
  listLabel?: string;
}

/** 任务与项目共用移动列表的外观、当前位置标记和键盘交互。 */
export function MovePickerList<T extends { id: string }>({
  targets,
  currentId,
  query,
  onQueryChange,
  onSelect,
  searchPlaceholder,
  emptyMessage,
  renderTarget,
  isNested,
  listLabel,
}: Props<T>) {
  const { t } = useTranslation('task');
  const select = (target: T) => {
    if (target.id !== currentId) onSelect(target);
  };
  const { listboxId, active, setActiveIndex, optionId, onKeyDown } = useListboxNavigation(
    targets,
    select,
  );
  const initialIndex = query.trim()
    ? 0
    : Math.max(
        targets.findIndex((target) => target.id === currentId),
        0,
      );

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [query, initialIndex, setActiveIndex]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 border-b border-border px-2 pb-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded={targets.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={targets.length > 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label={searchPlaceholder}
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-label={listLabel ?? t('move')}
        className="flex max-h-72 flex-col gap-0.5 overflow-y-auto"
      >
        {targets.length === 0 && (
          <p className="px-2 py-2 text-meta text-muted-foreground">{emptyMessage}</p>
        )}
        {targets.map((target, index) => {
          const selected = target.id === currentId;
          return (
            <div
              key={target.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              aria-current={selected || undefined}
              onMouseMove={() => index !== active && setActiveIndex(index)}
              // 保持输入框焦点
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(target)}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm max-md:py-2.5',
                index === active && 'bg-accent',
                isNested?.(target) && 'pl-7',
              )}
            >
              {renderTarget(target)}
              <Check
                className={cn(
                  'ml-auto h-3.5 w-3.5 shrink-0 text-primary',
                  selected ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
