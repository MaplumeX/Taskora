import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MoreHorizontal, Tag, Trash2 } from 'lucide-react';

import type { AreaResponseDto, UpdateAreaDto } from '@taskora/shared';

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MenuItems, type MenuItem } from '@/components/common/MenuItems';
import { FieldPickerDialog } from '@/components/common/FieldPicker';
import { ActionSheet, ActionSheetContent, ActionSheetTrigger } from '@/components/ui/action-sheet';
import { useIsDesktop } from '@/lib/use-media-query';
import { useDeleteArea, useUpdateArea } from '@taskora/api';
import { TagsField } from '@/components/task/fields/TagsField';
import { ReviewPicker, useReviewMenuItem } from '@/components/review/ReviewSchedule';
import { useInReviewMode } from '@/components/review/reviewMode';
import { isTouchContextMenu } from '../../lib/useLongPress';

export interface AreaMoreMenuProps {
  area: AreaResponseDto;
}

type PickerKind = 'tags' | 'review' | null;

export function AreaMoreMenu({ area }: AreaMoreMenuProps) {
  return <AreaMenu area={area} />;
}

/** 分组头的右键入口：复用详情页的 Area 操作，不显示更多按钮。 */
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
  const { t: ta } = useTranslation('area');
  const { t: tr } = useTranslation('review');
  const navigate = useNavigate();
  const inReview = useInReviewMode();
  const updateArea = useUpdateArea();
  const deleteArea = useDeleteArea();
  // 窄屏「…」：底部动作面板 + 字段卡片；右键入口只在桌面出现（触屏长按只负责拖动）。
  const sheet = !useIsDesktop() && !contextMenu;

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [activePicker, setActivePicker] = React.useState<PickerKind>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => DOMRect } | null>(null);

  const closeMenu = () => setMenuOpen(false);

  const openPicker = (kind: Exclude<PickerKind, null>) => {
    closeMenu();
    setActivePicker(kind);
  };

  const reviewItem = useReviewMenuItem(() => openPicker('review'));
  const items: MenuItem[] = [
    { icon: Tag, label: t('tags'), onSelect: () => openPicker('tags') },
    ...(contextMenu ? [] : [reviewItem]),
    {
      icon: Trash2,
      label: tc('delete'),
      destructive: true,
      separated: true,
      onSelect: () => {
        closeMenu();
        setConfirmOpen(true);
      },
    },
  ];

  const handlePatch = (data: UpdateAreaDto) => {
    updateArea.mutate(
      { id: area.id, data },
      {
        onError: () => toast.error(tc('saveFailed')),
      },
    );
  };

  const handleDelete = () => {
    if (deleteArea.isPending) return;
    deleteArea.mutate(area.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        // 回顾中删除：回顾会话自动进入下一个，不跳走
        if (!contextMenu && !inReview) navigate('/today');
      },
      onError: () => toast.error(tc('deleteFailed')),
    });
  };

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground max-md:-mr-1.5 max-md:h-11 max-md:w-11"
      aria-label={tc('more')}
    >
      <MoreHorizontal className="h-4 w-4 max-md:h-5 max-md:w-5" />
    </Button>
  );
  const pickerBody = (
    <>
      {activePicker === 'tags' && <TagsField current={area} onPatch={handlePatch} />}
      {activePicker === 'review' && <ReviewPicker target={{ kind: 'area', ...area }} />}
    </>
  );

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
      {sheet ? (
        <>
          <ActionSheet open={menuOpen} onOpenChange={setMenuOpen}>
            <ActionSheetTrigger asChild>{trigger}</ActionSheetTrigger>
            <ActionSheetContent title={area.title || ta('defaultTitle')}>
              <MenuItems items={items} sheet />
            </ActionSheetContent>
          </ActionSheet>
          <FieldPickerDialog
            label={activePicker === 'review' ? tr('title') : t('tags')}
            open={activePicker !== null}
            onOpenChange={(o) => !o && setActivePicker(null)}
          >
            {pickerBody}
          </FieldPickerDialog>
        </>
      ) : (
        <>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            {contextMenu ? (
              <PopoverAnchor virtualRef={virtualAnchorRef} />
            ) : (
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            )}
            <PopoverContent align="end" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
              <MenuItems items={items} />
            </PopoverContent>
          </Popover>

          <Popover open={activePicker !== null} onOpenChange={(o) => !o && setActivePicker(null)}>
            <PopoverAnchor virtualRef={containerRef} />
            <PopoverContent align="end" onClick={(e) => e.stopPropagation()}>
              {pickerBody}
            </PopoverContent>
          </Popover>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>
              {ta('deleteConfirmTitle', { name: area.title || ta('newItemPlaceholder') })}
            </DialogTitle>
            <DialogDescription>{ta('deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleteArea.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              {tc('cancel')}
            </Button>
            <Button variant="destructive" disabled={deleteArea.isPending} onClick={handleDelete}>
              {tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
