import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderTree, Layers } from 'lucide-react';

import { useAreasQuery } from '@taskora/api';
import type { ProjectResponseDto, UpdateProjectDto } from '@taskora/shared';

import { MovePickerList } from '@/components/common/MovePickerList';
import { needleOf, rankByName } from '@/lib/nameMatch';

interface Props {
  current: Pick<ProjectResponseDto, 'areaId'>;
  onSelect: (data: UpdateProjectDto) => void;
}

/** 项目只能移动到区域或移为无区域；其余交互与任务的移动选择器一致。 */
export function ProjectMovePicker({ current, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const { data: areas = [] } = useAreasQuery();
  const [query, setQuery] = useState('');
  const targets = useMemo(() => {
    const noArea = {
      id: 'no-area',
      areaId: null,
      title: t('project:noArea'),
      names: [t('project:noArea'), i18n.getFixedT('en')('project:noArea')],
    };
    const all = [
      noArea,
      ...areas.map((area) => ({
        id: `area:${area.id}`,
        areaId: area.id,
        title: area.title || t('area:newItemPlaceholder'),
        names: [area.title || t('area:newItemPlaceholder')],
      })),
    ];
    return rankByName(all, (target) => target.names, needleOf(query));
  }, [areas, query, t, i18n]);

  return (
    <MovePickerList
      targets={targets}
      currentId={current.areaId ? `area:${current.areaId}` : 'no-area'}
      query={query}
      onQueryChange={setQuery}
      onSelect={(target) => onSelect({ areaId: target.areaId })}
      searchPlaceholder={t('project:moveSearchPlaceholder')}
      emptyMessage={t('project:moveNoResults')}
      renderTarget={(target) => {
        const Icon = target.areaId === null ? FolderTree : Layers;
        return (
          <>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-semibold">{target.title}</span>
          </>
        );
      }}
    />
  );
}
