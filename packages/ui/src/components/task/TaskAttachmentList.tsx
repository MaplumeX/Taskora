import * as React from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { File, FileImage, FileText, GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { AttachmentResponseDto } from '@taskora/shared';
import {
  BlobUnavailableError,
  isPreviewableImage,
  openAttachment,
  useAttachmentPreviewUrl,
  useBlobActivity,
  useDeleteAttachment,
  useRenameAttachment,
  useReorderAttachments,
} from '@taskora/api';
import { dndListProps, useHeldOrder } from '../../lib/dnd';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { MenuRow } from '@/components/common/MenuRow';
import { useLongPress } from '../../lib/useLongPress';
import { cn } from '@/lib/utils';

interface Props {
  taskId: string;
  attachments: AttachmentResponseDto[];
}

/** 字节数的简短写法（1.2 MB）。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function iconFor(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('text/') || mimeType === 'application/pdf') return FileText;
  return File;
}

/** 打不开时的提示：还没上传完 / 离线且本机没有，其余统称失败。 */
function useOpenFailureToast() {
  const { t } = useTranslation();
  return (error: unknown) => {
    if (error instanceof BlobUnavailableError) {
      toast.error(
        t(
          error.reason === 'not-uploaded' ? 'task:attachmentNotUploaded' : 'task:attachmentOffline',
        ),
      );
    } else {
      toast.error(t('task:attachmentOpenFailed'));
    }
  };
}

/**
 * 展开任务里的附件列表（ADR-0019）：紧凑行，类型图标 + 文件名 + 大小 / 传输
 * 状态；点击打开（位图在 lightbox 里预览），右键 / 长按改名、删除，把手排序。
 */
export function TaskAttachmentList({ taskId, attachments: source }: Props) {
  const { t } = useTranslation();
  const [attachments, holdOrder] = useHeldOrder(source, attachmentKey);
  const reorder = useReorderAttachments();
  const [preview, setPreview] = React.useState<AttachmentResponseDto | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = attachments.map((item) => item.id);
    const orderedIds = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    holdOrder(orderedIds);
    reorder.mutate({ taskId, orderedIds }, { onError: () => toast.error(t('common:saveFailed')) });
  };

  if (attachments.length === 0) return null;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={attachments.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul
            {...dndListProps}
            aria-label={t('task:attachments')}
            className="flex flex-col divide-y divide-border/60"
          >
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                onPreview={() => setPreview(attachment)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function AttachmentRow({
  attachment,
  onPreview,
}: {
  attachment: AttachmentResponseDto;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const activity = useBlobActivity(attachment.blobHash);
  const rename = useRenameAttachment();
  const remove = useDeleteAttachment();
  const failed = useOpenFailureToast();
  const Icon = iconFor(attachment.mimeType);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: attachment.id });

  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(attachment.name);

  const [menuOpen, setMenuOpen] = React.useState(false);
  const virtualAnchorRef = React.useRef<{ getBoundingClientRect: () => DOMRect } | null>(null);
  const openMenuAt = (x: number, y: number) => {
    virtualAnchorRef.current = { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
    setMenuOpen(true);
  };
  const longPress = useLongPress((p) => openMenuAt(p.x, p.y));

  const open = () => {
    if (isPreviewableImage(attachment.mimeType)) {
      onPreview();
      return;
    }
    openAttachment(attachment).catch(failed);
  };

  const commitName = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === attachment.name) {
      setName(attachment.name);
      return;
    }
    rename.mutate(
      { id: attachment.id, taskId: attachment.taskId, name: trimmed },
      { onError: () => toast.error(t('common:saveFailed')) },
    );
  };

  const status =
    activity === 'uploading'
      ? t('task:attachmentUploading')
      : activity === 'pending-upload'
        ? t('task:attachmentPendingUpload')
        : activity === 'downloading'
          ? t('task:attachmentDownloading')
          : formatBytes(attachment.size);

  return (
    <li
      ref={setNodeRef}
      data-attachment-row
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        'group/attachment relative flex min-h-7 items-center gap-2 bg-card text-body max-md:min-h-11',
        isDragging && 'opacity-80 shadow-row-lift',
      )}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenuAt(e.clientX, e.clientY);
      }}
      {...longPress}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {editing ? (
        <Input
          autoFocus
          aria-label={t('task:attachmentRename')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitName();
            } else if (e.key === 'Escape') {
              setName(attachment.name);
              setEditing(false);
            }
          }}
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-body shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 max-md:h-11"
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left hover:underline"
          title={attachment.name}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {attachment.name}
        </button>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{status}</span>

      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t('task:reorderAttachment')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 opacity-0 focus-visible:opacity-100 group-hover/attachment:opacity-100 active:cursor-grabbing max-md:h-11 max-md:w-11 max-md:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent align="start" className="w-44 p-1" onClick={(e) => e.stopPropagation()}>
          <MenuRow
            icon={Pencil}
            onClick={() => {
              setMenuOpen(false);
              setName(attachment.name);
              setEditing(true);
            }}
          >
            {t('task:attachmentRename')}
          </MenuRow>
          <MenuRow
            icon={Trash2}
            onClick={() => {
              setMenuOpen(false);
              remove.mutate(
                { id: attachment.id, taskId: attachment.taskId },
                { onError: () => toast.error(t('common:saveFailed')) },
              );
            }}
          >
            {t('common:delete')}
          </MenuRow>
        </PopoverContent>
      </Popover>
    </li>
  );
}

/** 位图附件的 lightbox：按附件的 mimeType 渲染 object URL，可再交给平台打开。 */
function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: AttachmentResponseDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { url, error } = useAttachmentPreviewUrl(attachment);
  const failed = useOpenFailureToast();

  React.useEffect(() => {
    if (!error) return;
    failed(error);
    onClose();
  }, [error]); // 只在出错时提示一次

  return (
    <Dialog open={attachment !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <DialogTitle className="truncate pr-8">{attachment?.name}</DialogTitle>
        <div className="flex min-h-40 items-center justify-center">
          {url ? (
            <img
              src={url}
              alt={attachment?.name ?? ''}
              className="max-h-[70vh] max-w-full rounded object-contain"
            />
          ) : (
            <span className="text-sm text-muted-foreground">{t('task:attachmentDownloading')}</span>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            onClick={() => attachment && openAttachment(attachment).catch(failed)}
          >
            {t('task:attachmentOpen')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function attachmentKey(attachment: AttachmentResponseDto) {
  return attachment.id;
}
