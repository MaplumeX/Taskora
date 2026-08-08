import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoreHorizontal, Tag, Trash2 } from 'lucide-react';

import type { AreaResponseDto, UpdateAreaDto } from '@taskora/shared';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { MenuRow } from '@/components/common/MenuRow';
import { areaKeys, useDeleteArea, useUpdateArea } from '@/lib/hooks/useAreas';
import { TagsField } from '@/components/task/fields/TagsField';

export interface AreaMoreMenuProps {
  area: AreaResponseDto;
}

type PickerKind = 'tags' | null;

export function AreaMoreMenu({ area }: AreaMoreMenuProps) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  const handlePatch = (data: UpdateAreaDto) => {
    updateArea.mutate(
      { id: area.id, data },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: areaKeys.detail(area.id) });
          void queryClient.invalidateQueries({ queryKey: areaKeys.all });
        },
        onError: () => toast.error(tc('saveFailed')),
      },
    );
  };

  const handleDelete = () => {
    closeMenu();
    deleteArea.mutate(area.id, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: areaKeys.all });
        navigate('/today');
      },
      onError: () => toast.error(tc('deleteFailed')),
    });
  };

  return (
    <div ref={containerRef}>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
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
        <PopoverContent
          align="end"
          className="w-44 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuRow icon={Tag} onClick={() => openPicker('tags')}>
            {t('tags')}
          </MenuRow>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <MenuRow icon={Trash2} destructive onClick={handleDelete}>
            {tc('delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>

      <Popover
        open={activePicker !== null}
        onOpenChange={(o) => !o && setActivePicker(null)}
      >
        <PopoverAnchor virtualRef={containerRef} />
        <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
          {activePicker === 'tags' && (
            <TagsField
              current={area as unknown as Parameters<typeof TagsField>[0]['current']}
              onPatch={handlePatch as unknown as Parameters<typeof TagsField>[0]['onPatch']}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
