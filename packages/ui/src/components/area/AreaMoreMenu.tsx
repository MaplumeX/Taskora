import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoreHorizontal, Tag, Trash2 } from 'lucide-react';

import type { AreaResponseDto, UpdateAreaDto } from '@taskora/shared';

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MenuRow } from '@/components/common/MenuRow';
import { useDeleteArea, useUpdateArea } from '@taskora/api';
import { TagsField } from '@/components/task/fields/TagsField';
import { isTouchContextMenu } from '../../lib/useLongPress';

export interface AreaMoreMenuProps {
  area: AreaResponseDto;
}

type PickerKind = 'tags' | null;

export function AreaMoreMenu({ area }: AreaMoreMenuProps) {
  return <AreaMenu area={area} />;
}

/** 分组标题的右键入口：复用详情页的 Area 操作，不显示更多按钮。 */
export function AreaContextMenu({
  area,
  children,
}: AreaMoreMenuProps & { children: React.ReactNode }) {
  return (
    <AreaMenu area={area} contextMenu>
      {children}
    </AreaMenu>
  );
}

function AreaMenu({
  area,
  contextMenu = false,
  children,
}: AreaMoreMenuProps & {
  contextMenu?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => DOMRect } | null>(null);

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  const handlePatch = (data: UpdateAreaDto) => {
    updateArea.mutate(
      { id: area.id, data },
      {
        onError: () => toast.error(tc('saveFailed')),
      },
    );
  };

  const handleDelete = () => {
    closeMenu();
    deleteArea.mutate(area.id, {
      onSuccess: () => {
        if (!contextMenu) navigate('/today');
      },
      onError: () => toast.error(tc('deleteFailed')),
    });
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={
        contextMenu
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isTouchContextMenu(event)) return;
              const { clientX, clientY } = event;
              virtualAnchorRef.current = {
                getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0),
              };
              setActivePicker(null);
              setMenuOpen(true);
            }
          : undefined
      }
    >
      {children}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        {contextMenu ? (
          <PopoverAnchor virtualRef={virtualAnchorRef} />
        ) : (
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={tc('more')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        )}
        <PopoverContent align="end" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
          <MenuRow icon={Tag} onClick={() => openPicker('tags')}>
            {t('tags')}
          </MenuRow>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow icon={Trash2} destructive onClick={handleDelete}>
            {tc('delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>

      <Popover open={activePicker !== null} onOpenChange={(o) => !o && setActivePicker(null)}>
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
          {activePicker === 'tags' && <TagsField current={area} onPatch={handlePatch} />}
        </PopoverContent>
      </Popover>
    </div>
  );
}
