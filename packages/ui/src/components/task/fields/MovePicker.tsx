import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Inbox, Layers, Search } from 'lucide-react';

import type { UpdateTaskDto } from '@taskora/shared';
import { useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';

import { ProjectProgressPie } from '@/components/project/ProjectProgressRing';
import { cn } from '@/lib/utils';
import {
  buildMoveTargets,
  currentMoveTargetId,
  moveTargetDto,
  type MoveCurrent,
  type MoveTarget,
} from './moveTargets';

interface Props {
  current: MoveCurrent;
  /** 选中目标后的写入 DTO；关闭由调用方负责。 */
  onSelect: (data: UpdateTaskDto) => void;
}

/**
 * 「移动」选择器（对齐 Things 3 的 Move popover，`.scratch/move-picker`）：
 * 只列「放在哪」——Inbox、区域、项目，与侧边栏同序同图标。可输入过滤，
 * `↑`/`↓` 移动高亮、`Enter` 选中（`Esc` 由宿主 Popover / Dialog 关闭）。
 * 当前所在位置打勾；选中当前位置不写入。
 */
export function MovePicker({ current, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const kindOf = useLaterProjectKind();
  const listboxId = useId();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inboxNames = useMemo(() => [t('nav:inbox'), i18n.getFixedT('en')('nav:inbox')], [t, i18n]);
  const targets = useMemo(
    () =>
      buildMoveTargets({
        query,
        projects,
        areas,
        inboxNames,
        isLater: (project) => kindOf(project) !== null,
      }),
    [query, projects, areas, inboxNames, kindOf],
  );
  const currentId = currentMoveTargetId(current);
  const active = Math.min(activeIndex, Math.max(targets.length - 1, 0));
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // 输入变化回到第一项；无搜索词时从当前位置开始
  useEffect(() => {
    const index = query.trim() ? 0 : targets.findIndex((target) => target.id === currentId);
    setActiveIndex(Math.max(index, 0));
  }, [query]);

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active, listboxId]);

  const select = (target: MoveTarget) => {
    if (target.id === currentId) return;
    onSelect(moveTargetDto(target));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (targets.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((active + step + targets.length) % targets.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = targets[active];
      if (target) select(target);
    }
  };

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
          aria-label={t('task:moveSearchPlaceholder')}
          placeholder={t('task:moveSearchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-label={t('task:move')}
        className="flex max-h-72 flex-col gap-0.5 overflow-y-auto"
      >
        {targets.length === 0 && (
          <p className="px-2 py-2 text-meta text-muted-foreground">{t('task:moveNoResults')}</p>
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
                target.kind === 'project' && target.nested && 'pl-7',
              )}
            >
              <MoveTargetRow target={target} />
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

function MoveTargetRow({ target }: { target: MoveTarget }) {
  const { t } = useTranslation();
  switch (target.kind) {
    case 'inbox':
      return (
        <>
          <Inbox className="h-4 w-4 shrink-0 text-nav-inbox" />
          <span className="truncate">{t('nav:inbox')}</span>
        </>
      );
    case 'area':
      return (
        <>
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-semibold">
            {target.area.title || t('area:newItemPlaceholder')}
          </span>
        </>
      );
    case 'project':
      return (
        <>
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <ProjectProgressPie
              total={target.project.taskTotalCount}
              completed={target.project.taskCompletedCount}
              projectStatus={target.project.status}
              size={16}
            />
          </span>
          <span className={cn('truncate', target.later && 'text-muted-foreground')}>
            {target.project.title || t('project:newItemPlaceholder')}
          </span>
          {target.areaTitle && (
            <span className="shrink-0 truncate text-meta text-muted-foreground">
              {target.areaTitle}
            </span>
          )}
        </>
      );
  }
}
