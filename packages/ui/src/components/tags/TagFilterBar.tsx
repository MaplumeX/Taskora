import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { TagResponseDto } from '@taskora/shared';
import { useTagGroupsQuery, useTagsQuery } from '@taskora/api';

import { cn } from '@/lib/utils';
import {
  collectFilterOptions,
  filterInOptions,
  matchesTagFilter,
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
 * 不再出现在列表里时自动失效。
 */
export function useTagFilter<T>(items: T[], effectiveOf: (item: T) => string[]) {
  const { pathname } = useLocation();
  const { data: tags = [] } = useTagsQuery();
  const { data: groups = [] } = useTagGroupsQuery();
  const [state, setState] = useState<{ pathname: string; filter: TagFilter } | null>(null);
  // 同一页面组件跨路由复用时（如项目 A → 项目 B → 回到 A）也不恢复旧过滤
  useEffect(() => setState(null), [pathname]);

  const effective = useMemo(() => items.map(effectiveOf), [items, effectiveOf]);
  const options = useMemo(
    () => collectFilterOptions(effective, tags, groups),
    [effective, tags, groups],
  );
  const selected = state?.pathname === pathname ? state.filter : null;
  const filter = selected && filterInOptions(selected, options) ? selected : null;
  const visible = useMemo(
    () =>
      filter ? items.filter((_, index) => matchesTagFilter(effective[index], filter, tags)) : items,
    [items, effective, filter, tags],
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

  const group =
    filter?.kind === 'group' ? options.groups.find((g) => g.id === filter.groupId) : undefined;
  // 再点一次已选中的项即取消
  const toggle = (next: TagFilter, active: boolean) => onChange(active ? null : next);

  return (
    <div role="toolbar" aria-label={t('tag:filterLabel')} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={filter === null} onClick={() => onChange(null)}>
          {t('tag:filterAll')}
        </Chip>
        {options.groups.map((g) => {
          const active = filter?.kind === 'group' && filter.groupId === g.id;
          return (
            <Chip
              key={g.id}
              active={active}
              onClick={() => toggle({ kind: 'group', groupId: g.id, tagId: null }, active)}
            >
              {g.title}
            </Chip>
          );
        })}
        {options.tags.map((tag) => {
          const active = filter?.kind === 'tag' && filter.tagId === tag.id;
          return (
            <Chip
              key={tag.id}
              active={active}
              onClick={() => toggle({ kind: 'tag', tagId: tag.id }, active)}
            >
              <TagDot tag={tag} />
              {tag.title}
            </Chip>
          );
        })}
        {options.untagged && (
          <Chip
            active={filter?.kind === 'untagged'}
            onClick={() => toggle({ kind: 'untagged' }, filter?.kind === 'untagged')}
          >
            {t('tag:filterUntagged')}
          </Chip>
        )}
      </div>
      {group && filter?.kind === 'group' && (
        <div className="flex flex-wrap items-center gap-1.5 pl-3">
          {group.tags.map((tag) => {
            const active = filter.tagId === tag.id;
            return (
              <Chip
                key={tag.id}
                active={active}
                onClick={() =>
                  onChange({ kind: 'group', groupId: group.id, tagId: active ? null : tag.id })
                }
              >
                <TagDot tag={tag} />
                {tag.title}
              </Chip>
            );
          })}
        </div>
      )}
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
