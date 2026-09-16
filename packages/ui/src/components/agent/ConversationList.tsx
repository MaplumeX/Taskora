import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ConversationDto } from '@taskora/shared';
import { useCreateConversation, useDeleteConversation, useRenameConversation } from '@taskora/api';

/**
 * Conversation list: create / switch / rename / delete.
 *
 * Rendered inside a slide-in drawer (ChatGPT-style): the list stays hidden
 * until the user summons it, so it never occupies a permanent column.
 * `onSelect` closes the drawer after a switch.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationDto[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation(['agent', 'common']);
  const create = useCreateConversation();
  const rename = useRenameConversation();
  const remove = useDeleteConversation();
  const [renaming, setRenaming] = useState<ConversationDto | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<ConversationDto | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <Button
          className="w-full justify-start gap-2"
          variant="outline"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onSuccess: (c) => onSelect(c.id) })}
        >
          <Plus className="h-4 w-4" />
          {t('agent:newConversation')}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={cn(
              'group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors',
              conversation.id === activeId
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(conversation.id)}
              title={conversation.title ?? t('agent:untitled')}
            >
              {conversation.title ?? t('agent:untitled')}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={t('common:more')}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenaming(conversation);
                    setRenameValue(conversation.title ?? '');
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t('agent:renameConversation')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleting(conversation)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('agent:deleteConversation')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            {t('agent:noConversations')}
          </p>
        ) : null}
      </nav>

      {/* Rename dialog */}
      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('agent:renameConversation')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renaming && renameValue.trim()) {
                rename.mutate({ id: renaming.id, title: renameValue.trim() });
                setRenaming(null);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              {t('common:cancel')}
            </Button>
            <Button
              disabled={!renameValue.trim() || rename.isPending}
              onClick={() => {
                if (renaming && renameValue.trim()) {
                  rename.mutate({ id: renaming.id, title: renameValue.trim() });
                  setRenaming(null);
                }
              }}
            >
              {t('common:save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('agent:deleteConversationConfirm')}</DialogTitle>
            <DialogDescription>{t('agent:deleteConversationConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('common:cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id);
                  setDeleting(null);
                }
              }}
            >
              {t('common:delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
