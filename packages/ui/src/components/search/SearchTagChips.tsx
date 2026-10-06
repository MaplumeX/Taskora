import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TagResponseDto } from '@taskora/shared';

/**
 * 搜索框前的 `#tag` chip（Quick Find 与搜索页共用，tags-things3-v2 issue 07）。
 * 找不到的 Tag（已删除）不显示。
 */
export function SearchTagChips({
  tagIds,
  tags,
  onRemove,
  size = 'sm',
}: {
  tagIds: readonly string[];
  tags: readonly TagResponseDto[];
  onRemove: (tagId: string) => void;
  size?: 'sm' | 'lg';
}) {
  const { t } = useTranslation();
  return (
    <>
      {tagIds.map((id) => {
        const tag = tags.find((it) => it.id === id);
        if (!tag) return null;
        return (
          <span
            key={id}
            data-search-tag={id}
            className={
              size === 'lg'
                ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-body'
                : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-meta'
            }
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="max-w-[10rem] truncate">#{tag.title}</span>
            <button
              type="button"
              aria-label={t('search:removeTag', { name: tag.title })}
              // 保持输入框焦点
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </>
  );
}
