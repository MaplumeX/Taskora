import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { useCreateTag, useTagsQuery } from '@taskora/api';

import { cn } from '@/lib/utils';
import { buildTagPickerRows, type TagPickerRow, type TagSelectionState } from './tagPickerOptions';

interface Props {
  /** 某个 Tag 在被编辑对象上的状态；单个对象只会是 all / none。 */
  stateOf: (tagId: string) => TagSelectionState;
  /** 切换一个 Tag（含刚新建的）；怎么写入由调用方决定。 */
  onToggle: (tagId: string) => void;
  /**
   * 是否提供「新建 Tag」行（默认 true）。Quick Add 浮窗传 false：新建是
   * 写操作，浮窗不装配 Engine，不能在那里落库。
   */
  allowCreate?: boolean;
}

/**
 * Tag 选择器（对齐 Things 3 的 Tags 输入，`.scratch/tags-things3` issue 02）：
 * 按 Tag 树缩进列出（父 Tag 也可勾选），可输入过滤，输入不存在的名字可
 * 当场新建并打上（新建的 Tag 在顶层）。`↑`/`↓` 移动高亮，
 * `Enter` 切换高亮项且不关闭（便于连续打多个），`Esc` 由宿主关闭。
 */
export function TagPicker({ stateOf, onToggle, allowCreate = true }: Props) {
  const { t } = useTranslation();
  const { data: tags = [] } = useTagsQuery();
  const createTag = useCreateTag();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => {
    const all = buildTagPickerRows({ tags, query });
    return allowCreate ? all : all.filter((row) => row.kind !== 'create');
  }, [tags, query, allowCreate]);
  const active = Math.min(activeIndex, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listboxId]);

  const choose = (row: TagPickerRow) => {
    if (row.kind === 'tag') {
      onToggle(row.id);
      return;
    }
    if (createTag.isPending) return;
    createTag.mutate(
      { title: row.title },
      {
        onSuccess: (tag) => {
          setQuery('');
          onToggle(tag.id);
        },
        onError: () => toast.error(t('common:createFailed')),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((active + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = options[active];
      if (row) choose(row);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 border-b border-border px-2 pb-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label={t('tag:pickerPlaceholder')}
          placeholder={t('tag:pickerPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable
        aria-label={t('task:tags')}
        className="flex max-h-72 flex-col gap-0.5 overflow-y-auto max-md:max-h-none"
      >
        {options.length === 0 && (
          <p className="px-2 py-2 text-meta text-muted-foreground">{t('tag:pickerEmpty')}</p>
        )}
        {options.map((row, index) => {
          const state = row.kind === 'tag' ? stateOf(row.id) : 'none';
          return (
            <div
              key={row.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
              onMouseMove={() => index !== active && setActiveIndex(index)}
              // 保持输入框焦点
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(row)}
              className={cn(
                'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm max-md:py-2.5',
                index === active && 'bg-accent',
              )}
              style={
                row.kind === 'tag' && row.depth > 0
                  ? { paddingLeft: `${0.5 + row.depth * 1.125}rem` }
                  : undefined
              }
            >
              {row.kind === 'tag' ? (
                <>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.tag.color }}
                  />
                  <span className="truncate">{row.tag.title}</span>
                  {row.path.length > 0 && (
                    <span className="min-w-0 shrink truncate text-meta text-muted-foreground">
                      {row.path.join(' › ')}
                    </span>
                  )}
                  <SelectionMark state={state} />
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t('tag:createNamed', { name: row.title })}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelectionMark({ state }: { state: TagSelectionState }) {
  const Icon = state === 'some' ? Minus : Check;
  return (
    <Icon
      className={cn(
        'ml-auto h-3.5 w-3.5 shrink-0 text-primary',
        state === 'none' ? 'opacity-0' : 'opacity-100',
      )}
    />
  );
}
