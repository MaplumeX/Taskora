import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Layers } from 'lucide-react';

import type { UpdateTaskDto } from '@taskora/shared';
import { useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';

import { ProjectProgressPie } from '@/components/project/ProjectProgressRing';
import { MovePickerList } from '@/components/common/MovePickerList';
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

  const [query, setQuery] = useState('');

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

  return (
    <MovePickerList
      targets={targets}
      currentId={currentId}
      query={query}
      onQueryChange={setQuery}
      onSelect={(target) => onSelect(moveTargetDto(target))}
      searchPlaceholder={t('task:moveSearchPlaceholder')}
      emptyMessage={t('task:moveNoResults')}
      renderTarget={(target) => <MoveTargetRow target={target} />}
      isNested={(target) => target.kind === 'project' && target.nested}
    />
  );
}

export function MoveTargetRow({ target }: { target: MoveTarget }) {
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
