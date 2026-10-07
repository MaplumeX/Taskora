import { Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AreaResponseDto } from '@taskora/shared';
import type { SelectionState } from '@taskora/api';

import { AreaContextMenu } from '@/components/area/AreaMoreMenu';
import { GroupHeaderRowShell } from './GroupHeaderRowShell';

interface Props {
  area: AreaResponseDto;
  selectionState?: SelectionState;
}

/** Area 分组标题保留图标、标题导航与右键菜单，与 Project 的图标槽位对齐。 */
export function AreaGroupHeaderRow({ area, selectionState = 'idle' }: Props) {
  const { t } = useTranslation();

  return (
    <AreaContextMenu area={area}>
      <GroupHeaderRowShell
        parentId={area.id}
        selectionState={selectionState}
        to={`/areas/${area.id}`}
        title={area.title || t('area:newItemPlaceholder')}
        placeholder={!area.title}
        icon={
          <span
            aria-hidden="true"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-nav-anytime"
          >
            <Layers className="h-4 w-4" />
          </span>
        }
      />
    </AreaContextMenu>
  );
}
