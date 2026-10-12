import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAreasQuery, useLaterProjectKind, useProjectsQuery } from '@taskora/api';
import type { ProjectResponseDto } from '@taskora/shared';

import { MovePickerList } from '@/components/common/MovePickerList';
import { MoveTargetRow, useHiddenLaterTargets } from '@/components/task/fields/MovePicker';
import { buildMoveTargets, type MoveTarget } from '@/components/task/fields/moveTargets';

type ProjectTarget = Extract<MoveTarget, { kind: 'project' }>;

interface Props {
  /** 分组当前所在项目（打勾，选中不写入）。 */
  currentProjectId: string;
  onSelect: (project: ProjectResponseDto) => void;
}

/**
 * Project Heading 的「移动」选择器（对齐 Things 3）：分组只能放进项目，
 * 候选与任务的移动选择器同源（未了结、未进 Trash 的项目，与侧边栏同序），
 * 去掉 Inbox 与区域行；行尾灰字标出所属区域。
 */
export function HeadingMovePicker({ currentProjectId, onSelect }: Props) {
  const { t } = useTranslation();
  const { data: projects = [] } = useProjectsQuery();
  const { data: areas = [] } = useAreasQuery();
  const kindOf = useLaterProjectKind();
  const [query, setQuery] = useState('');

  const targets = useMemo(() => {
    const areaTitle = new Map(areas.map((area) => [area.id, area.title]));
    return buildMoveTargets({
      query,
      projects,
      areas,
      inboxNames: [],
      isLater: (project) => kindOf(project) !== null,
    })
      .filter((target): target is ProjectTarget => target.kind === 'project')
      .map((target) => ({
        ...target,
        nested: false,
        areaTitle: target.project.areaId ? (areaTitle.get(target.project.areaId) ?? null) : null,
      }));
  }, [query, projects, areas, kindOf]);
  const currentId = `project:${currentProjectId}`;
  const later = useHiddenLaterTargets(targets, currentId);

  return (
    <MovePickerList
      targets={later.targets}
      currentId={currentId}
      query={query}
      onQueryChange={setQuery}
      onSelect={(target) => onSelect(target.project)}
      searchPlaceholder={t('project:moveHeadingSearchPlaceholder')}
      emptyMessage={t('project:moveHeadingNoResults')}
      renderTarget={(target) => <MoveTargetRow target={target} />}
      footer={later.footer}
      onInputKeyDown={later.onInputKeyDown}
    />
  );
}
