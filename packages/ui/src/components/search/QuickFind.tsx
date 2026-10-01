import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { TaskSearchHit } from '@taskora/shared';
import {
  useAreasQuery,
  useProjectsQuery,
  useRevealTask,
  useTagsQuery,
  useTaskSearchQuery,
  useUiInteractionStore,
} from '@taskora/api';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LIST_TARGETS, QuickFindRow } from './QuickFindRow';
import {
  buildQuickFindGroups,
  quickFindRoute,
  searchRoute,
  type QuickFindGroupId,
  type QuickFindItem,
  type QuickFindListTarget,
} from './quickFindResults';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** 结果末尾的「继续搜索」行：可被键盘选中，打开即转到主内容区的搜索页。 */
const CONTINUE = { kind: 'continue', id: 'continue' } as const;
type QuickFindOption = QuickFindItem | typeof CONTINUE;

const GROUP_LABEL_KEYS: Record<QuickFindGroupId, string> = {
  lists: 'search:groupLists',
  places: 'search:groupPlaces',
  tags: 'search:groupTags',
  tasks: 'search:groupTasks',
};

/**
 * Quick Find（`.scratch/quick-find` spec）：一个输入框既搜任务，也能跳到
 * 列表、区域、项目与标签。↑/↓ 在全部结果间移动（跨组），Enter 打开：
 * 导航目标直接跳转，任务走 Reveal（跳到所在视图并展开）。只含未了结、
 * 未进 Trash 的条目；「继续搜索」关闭面板，在主内容区的搜索页（`/search`）
 * 里把范围扩大到已了结与 Trash（对齐 Things 3）。
 */
export function QuickFind({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reveal = useRevealTask();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { data: tags = [] } = useTagsQuery();
  const search = useTaskSearchQuery(query);
  const { searchedQuery } = search;

  // 新一轮任务结果到达前保留上一轮，避免任务组随击键闪烁
  const [hits, setHits] = useState<TaskSearchHit[]>([]);
  useEffect(() => {
    if (!searchedQuery) setHits([]);
    else if (search.data) setHits(search.data);
  }, [searchedQuery, search.data]);

  const lists = useMemo<QuickFindListTarget[]>(() => {
    const english = i18n.getFixedT('en');
    return LIST_TARGETS.map((item) => ({
      to: item.to,
      names: [t(item.labelKey), english(item.labelKey)],
    }));
  }, [t, i18n]);

  // 导航目标与任务结果都按防抖后的搜索词推导，两者同步更新
  const groups = useMemo(
    () =>
      buildQuickFindGroups({
        query: searchedQuery,
        lists,
        projects,
        areas,
        tags,
        hits,
      }),
    [searchedQuery, lists, projects, areas, tags, hits],
  );
  const hasQuery = searchedQuery.length > 0;
  const items = useMemo<QuickFindOption[]>(() => {
    const found: QuickFindOption[] = groups.flatMap((group) => group.items);
    return hasQuery ? [...found, CONTINUE] : found;
  }, [groups, hasQuery]);
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    setActiveIndex(0);
  }, [searchedQuery]);

  useEffect(() => {
    document
      .getElementById(`${listboxId}-option-${active}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listboxId]);

  useEffect(() => {
    if (open) {
      // 打字唤起（issue 04）：首字符带入输入框
      const seed = useUiInteractionStore.getState().takeSearchSeed();
      if (seed) setQuery(seed);
      return;
    }
    setQuery('');
  }, [open]);

  const openItem = (item: QuickFindOption) => {
    onOpenChange(false);
    if (item.kind === 'continue') {
      navigate(searchRoute(query.trim()));
      return;
    }
    const route = quickFindRoute(item);
    if (route !== null) navigate(route);
    else if (item.kind === 'task') void reveal(item.hit.task.id, { allowTrash: true });
  };

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
      if (item) openItem(item);
    }
  };

  const noResults = items.every((item) => item.kind === 'continue');
  let index = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        // 挂载即聚焦输入框（不等下一个 tick），打字唤起时后续击键不丢
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="top-[12dvh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 max-md:top-2"
      >
        <DialogTitle className="sr-only">{t('search:title')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={items.length > 0 ? optionId(active) : undefined}
            aria-autocomplete="list"
            placeholder={t('search:inputPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              aria-label={t('search:clearSearch')}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div
          id={listboxId}
          role="listbox"
          aria-label={t('search:title')}
          className="max-h-[min(60dvh,28rem)] overflow-y-auto p-1.5"
        >
          {!hasQuery && (
            <p className="px-2 py-3 text-meta text-muted-foreground">{t('search:emptyHint')}</p>
          )}
          {hasQuery && search.isError && (
            <p className="px-2 py-3 text-meta text-destructive">{t('search:searchFailed')}</p>
          )}
          {hasQuery && !search.isPending && !search.isError && noResults && (
            <p className="px-2 py-3 text-meta text-muted-foreground">{t('search:noResults')}</p>
          )}
          {groups.map((group) => (
            <div key={group.id} role="group" aria-label={t(GROUP_LABEL_KEYS[group.id])}>
              <div
                aria-hidden
                className="px-2 pb-1 pt-2 text-meta font-semibold text-muted-foreground"
              >
                {t(GROUP_LABEL_KEYS[group.id])}
              </div>
              {group.items.map((item) => {
                index += 1;
                const itemIndex = index;
                return (
                  <div
                    key={item.id}
                    id={optionId(itemIndex)}
                    role="option"
                    aria-selected={itemIndex === active}
                    onMouseMove={() => itemIndex !== active && setActiveIndex(itemIndex)}
                    // 保持输入框焦点
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openItem(item)}
                    className={cn(
                      'cursor-default rounded-md px-2 py-1.5 text-body max-md:py-2.5',
                      itemIndex === active && 'bg-accent',
                    )}
                  >
                    <QuickFindRow
                      item={item}
                      query={searchedQuery}
                      projectTitle={(id) => projects.find((p) => p.id === id)?.title}
                      areaTitle={(id) => areas.find((a) => a.id === id)?.title}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {hasQuery && (
            <div
              id={optionId(items.length - 1)}
              role="option"
              aria-selected={active === items.length - 1}
              onMouseMove={() => active !== items.length - 1 && setActiveIndex(items.length - 1)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => openItem(CONTINUE)}
              className={cn(
                'mt-1 flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-body max-md:py-2.5',
                active === items.length - 1 && 'bg-accent',
              )}
            >
              <Search className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold text-primary">{t('search:continueSearch')}</span>
              <span className="truncate text-meta text-muted-foreground">
                {t('search:continueSearchHint')}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
