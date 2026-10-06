import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Search, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { TaskSearchHit } from '@taskora/shared';
import {
  useAreasQuery,
  useProjectsQuery,
  useRevealTask,
  useTaskSearchQuery,
  useUiInteractionStore,
} from '@taskora/api';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { LIST_TARGETS, QuickFindRow } from './QuickFindRow';
import { SearchTagChips } from './SearchTagChips';
import {
  autoChipOnSpace,
  removeToken,
  tagCompletions,
  tagTokenAt,
  type TagCompletion,
} from './quickFindInput';
import {
  buildQuickFindGroups,
  quickFindRoute,
  searchRoute,
  type QuickFindGroupId,
  type QuickFindItem,
  type QuickFindListTarget,
} from './quickFindResults';
import { useSearchTagScope } from './useSearchTagScope';

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
 *
 * `#tag`（tags-things3-v2 issue 07）：词首输入 `#` 进入 Tag 补全，Enter /
 * Tab / 点击把它变成输入框前的 chip；`#名字` 正好对应唯一的 Tag 时输入
 * 空格也会转换；Esc 退出补全（`#xxx` 留作普通文字），再按一次才关闭；
 * 光标在开头时 Backspace 删掉最后一个 chip。有 chip 时只列出命中全部 chip
 * 的区域、项目与任务（子树命中，chip 之间 AND），搜索词可以为空。
 */
export function QuickFind({ open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reveal = useRevealTask();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [caret, setCaret] = useState(0);
  // Esc 退出补全后，直到下一次输入前不再进入补全
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // 改写输入框内容后要放回的光标位置
  const pendingCaret = useRef<number | null>(null);

  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const { tags, inTags } = useSearchTagScope(chips);

  const token = completionDismissed ? null : tagTokenAt(query, caret);
  /** 补全词（null 表示不在补全中）：作为 effect / memo 的依赖。 */
  const tokenQuery = token?.query ?? null;
  // 补全期间正在输入的 `#xxx` 不参与任务搜索
  const searchText = token ? removeToken(query, token).text : query;
  const search = useTaskSearchQuery(searchText, { tagIds: chips });
  const { searchedQuery } = search;
  const tagged = chips.length > 0;
  const hasQuery = searchedQuery.length > 0 || tagged;

  // 新一轮任务结果到达前保留上一轮，避免任务组随击键闪烁
  const [hits, setHits] = useState<TaskSearchHit[]>([]);
  useEffect(() => {
    if (!hasQuery) setHits([]);
    else if (search.data) setHits(search.data);
  }, [hasQuery, search.data]);

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
        tagIds: chips,
        inTags,
      }),
    [searchedQuery, lists, projects, areas, tags, hits, chips, inTags],
  );
  const items = useMemo<QuickFindOption[]>(() => {
    const found: QuickFindOption[] = groups.flatMap((group) => group.items);
    return hasQuery ? [...found, CONTINUE] : found;
  }, [groups, hasQuery]);

  const completions = useMemo(
    () => (tokenQuery === null ? [] : tagCompletions(tags, tokenQuery, chips)),
    [tokenQuery, tags, chips],
  );
  const optionCount = token ? completions.length : items.length;
  const active = Math.min(activeIndex, Math.max(optionCount - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    setActiveIndex(0);
  }, [searchedQuery, tokenQuery]);

  useEffect(() => {
    document
      .getElementById(`${listboxId}-option-${active}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listboxId]);

  useLayoutEffect(() => {
    const at = pendingCaret.current;
    if (at === null || !inputRef.current) return;
    pendingCaret.current = null;
    inputRef.current.setSelectionRange(at, at);
  });

  useEffect(() => {
    if (open) {
      // 打字唤起（issue 04）：首字符带入输入框
      const seed = useUiInteractionStore.getState().takeSearchSeed();
      if (seed) {
        setQuery(seed);
        setCaret(seed.length);
      }
      return;
    }
    setQuery('');
    setChips([]);
    setCaret(0);
    setCompletionDismissed(false);
  }, [open]);

  const setText = (text: string, at: number) => {
    setQuery(text);
    setCaret(at);
    pendingCaret.current = at;
  };

  const addChip = (tagId: string) =>
    setChips((prev) => (prev.includes(tagId) ? prev : [...prev, tagId]));

  const chooseCompletion = (completion: TagCompletion) => {
    if (!token) return;
    const removed = removeToken(query, token);
    setText(removed.text, removed.caret);
    addChip(completion.tag.id);
    inputRef.current?.focus();
  };

  const openItem = (item: QuickFindOption) => {
    onOpenChange(false);
    if (item.kind === 'continue') {
      navigate(searchRoute(searchText.trim(), chips));
      return;
    }
    const route = quickFindRoute(item);
    if (route !== null) navigate(route);
    else if (item.kind === 'task') void reveal(item.hit.task.id, { allowTrash: true });
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const at = e.target.selectionStart ?? value.length;
    setCompletionDismissed(false);
    const composing = (e.nativeEvent as InputEvent).isComposing === true;
    const auto = composing ? null : autoChipOnSpace(value, at, tags);
    if (auto && !chips.includes(auto.tagId)) {
      setText(auto.text, auto.caret);
      addChip(auto.tagId);
      return;
    }
    setQuery(value);
    setCaret(at);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (token) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (completions.length === 0) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((active + step + completions.length) % completions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const completion = completions[active];
        if (completion) chooseCompletion(completion);
      }
      return;
    }
    const input = e.currentTarget;
    if (
      e.key === 'Backspace' &&
      chips.length > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0
    ) {
      e.preventDefault();
      setChips((prev) => prev.slice(0, -1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
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
        // 补全中按 Esc 只退出补全，不关闭面板
        onEscapeKeyDown={(e) => {
          if (!token) return;
          e.preventDefault();
          setCompletionDismissed(true);
        }}
        className="top-[12dvh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 max-md:top-[calc(0.5rem+var(--safe-area-top))]"
      >
        <DialogTitle className="sr-only">{t('search:title')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            <SearchTagChips
              tagIds={chips}
              tags={tags}
              onRemove={(id) => setChips((prev) => prev.filter((chip) => chip !== id))}
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={optionCount > 0}
              aria-controls={listboxId}
              aria-activedescendant={optionCount > 0 ? optionId(active) : undefined}
              aria-autocomplete="list"
              placeholder={tagged ? undefined : t('search:inputPlaceholder')}
              value={query}
              onChange={onChange}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              className="h-12 min-w-[6rem] flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
          </div>
          {(query || tagged) && (
            <button
              type="button"
              aria-label={t('search:clearSearch')}
              onClick={() => {
                setText('', 0);
                setChips([]);
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
          {token ? (
            <div role="group" aria-label={t('search:groupTags')}>
              {completions.length === 0 && (
                <p className="px-2 py-3 text-meta text-muted-foreground">
                  {t('search:tagCompletionEmpty')}
                </p>
              )}
              {completions.map((completion, completionIndex) => (
                <div
                  key={completion.tag.id}
                  id={optionId(completionIndex)}
                  role="option"
                  aria-selected={completionIndex === active}
                  onMouseMove={() => completionIndex !== active && setActiveIndex(completionIndex)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseCompletion(completion)}
                  style={
                    completion.depth > 0
                      ? { paddingLeft: `${0.5 + completion.depth * 1.125}rem` }
                      : undefined
                  }
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-body max-md:py-2.5',
                    completionIndex === active && 'bg-accent',
                  )}
                >
                  <Tag
                    className="h-4 w-4 shrink-0"
                    style={{ color: completion.tag.color }}
                    aria-hidden
                  />
                  <span className="truncate">{completion.tag.title}</span>
                  {completion.path.length > 0 && (
                    <span className="min-w-0 shrink truncate text-meta text-muted-foreground">
                      {completion.path.join(' › ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
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
                  onMouseMove={() =>
                    active !== items.length - 1 && setActiveIndex(items.length - 1)
                  }
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
