import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { TagResponseDto } from '@taskora/shared';
import { useTagsQuery } from '@taskora/api';

import { cn } from '@/lib/utils';
import {
  collectFilterOptions,
  filterInOptions,
  filterLevels,
  matchesTagFilter,
  toggleFilterTag,
  type TagFilter,
  type TagFilterOptions,
} from './tagFilter';

interface TagFilterBarProps {
  options: TagFilterOptions | null;
  filter: TagFilter | null;
  onChange: (filter: TagFilter | null) => void;
}

/**
 * 列表页的 Tag 过滤（`.scratch/tags-things3` issue 05）：返回过滤后的条目
 * 与过滤栏的 props。状态只属于当前页面（路由变化即失效），选中的 Tag
 * 不再出现在列表里时自动失效。root 给定时（Tag 详情页）第一行只列它的
 * 子 Tag。
 */
export function useTagFilter<T>(
  items: T[],
  effectiveOf: (item: T) => string[],
  root: string | null = null,
) {
  const { pathname } = useLocation();
  const { data: tags = [] } = useTagsQuery();
  const [state, setState] = useState<{ pathname: string; filter: TagFilter } | null>(null);
  // 同一页面组件跨路由复用时（如项目 A → 项目 B → 回到 A）也不恢复旧过滤
  useEffect(() => setState(null), [pathname]);

  const effective = useMemo(() => items.map(effectiveOf), [items, effectiveOf]);
  const options = useMemo(
    () => collectFilterOptions(effective, tags, root),
    [effective, tags, root],
  );
  const selected = state?.pathname === pathname ? state.filter : null;
  const filter = selected && filterInOptions(selected, options) ? selected : null;
  const visible = useMemo(
    () =>
      filter && options
        ? items.filter((_, index) => matchesTagFilter(effective[index], filter, options.forest))
        : items,
    [items, effective, filter, options],
  );

  const bar: TagFilterBarProps = {
    options,
    filter,
    onChange: (next) => setState(next ? { pathname, filter: next } : null),
  };
  return { visible, filtering: filter !== null, bar };
}

export function TagFilterBar({ options, filter, onChange }: TagFilterBarProps) {
  const { t } = useTranslation();
  if (!options) return null;

  const path = filter?.kind === 'tag' ? filter.path : [];
  const levels = filterLevels(options, path);

  return (
    <div role="toolbar" aria-label={t('tag:filterLabel')} className="flex flex-col gap-1.5">
      {levels.map((level, index) => (
        <div
          key={index === 0 ? 'root' : path[index - 1]}
          className="flex flex-wrap items-center gap-1.5"
          style={index > 0 ? { paddingLeft: `${index * 0.75}rem` } : undefined}
        >
          {index === 0 && (
            <Chip active={filter === null} onClick={() => onChange(null)}>
              {t('tag:filterAll')}
            </Chip>
          )}
          {level.map((tag) => (
            <Chip
              key={tag.id}
              active={path[index] === tag.id}
              onClick={() => onChange(toggleFilterTag(filter, index, tag.id))}
            >
              <TagDot tag={tag} />
              {tag.title}
            </Chip>
          ))}
          {index === 0 && options.untagged && (
            <Chip
              active={filter?.kind === 'untagged'}
              onClick={() => onChange(filter?.kind === 'untagged' ? null : { kind: 'untagged' })}
            >
              {t('tag:filterUntagged')}
            </Chip>
          )}
        </div>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        // 不触发列表的空白点击（清空 Selection）
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 text-meta transition-colors max-md:py-1.5',
        active
          ? 'border-transparent bg-accent font-medium text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/60',
      )}
    >
      {children}
    </button>
  );
}

function TagDot({ tag }: { tag: Pick<TagResponseDto, 'color'> }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: tag.color }}
    />
  );
}
