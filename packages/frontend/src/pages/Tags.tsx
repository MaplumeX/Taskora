import * as React from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';

import type { CreateTagDto, TagResponseDto, UpdateTagDto } from '@taskora/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useTagsQuery,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
} from '@/lib/hooks/useTags';
import {
  useTagGroupsQuery,
  useCreateTagGroup,
  useDeleteTagGroup,
} from '@/lib/hooks/useTagGroups';
import { toast } from 'sonner';

const PRESET_COLORS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#6B7280',
];

export default function Tags() {
  const { data: tags = [], isLoading } = useTagsQuery();
  const { data: groups = [] } = useTagGroupsQuery();

  const [tagFormOpen, setTagFormOpen] = React.useState(false);
  const [editingTag, setEditingTag] = React.useState<TagResponseDto | null>(null);
  const [groupFormOpen, setGroupFormOpen] = React.useState(false);

  const groupedTagIds = new Set(
    groups.flatMap((g) => g.tags.map((t) => t.id)),
  );
  const ungrouped = tags.filter((t) => !groupedTagIds.has(t.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGroupFormOpen(true)}>
            新建分组
          </Button>
          <Button
            onClick={() => {
              setEditingTag(null);
              setTagFormOpen(true);
            }}
          >
            新建标签
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : (
        <>
          {groups.map((group) => (
            <TagGroupSection
              key={group.id}
              title={group.title}
              tags={group.tags}
              groupId={group.id}
              onEditTag={(t) => {
                setEditingTag(t);
                setTagFormOpen(true);
              }}
            />
          ))}

          <TagGroupSection
            title="未分组"
            tags={ungrouped}
            onEditTag={(t) => {
              setEditingTag(t);
              setTagFormOpen(true);
            }}
          />
        </>
      )}

      <TagForm
        open={tagFormOpen}
        onOpenChange={setTagFormOpen}
        tag={editingTag}
        groups={groups.map((g) => ({ id: g.id, title: g.title }))}
      />
      <TagGroupForm open={groupFormOpen} onOpenChange={setGroupFormOpen} />
    </div>
  );
}

function TagGroupSection({
  title,
  tags,
  groupId,
  onEditTag,
}: {
  title: string;
  tags: TagResponseDto[];
  groupId?: string;
  onEditTag: (tag: TagResponseDto) => void;
}) {
  const deleteGroup = useDeleteTagGroup();
  const deleteTag = useDeleteTag();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {groupId && tags.length === 0 && (
          <button
            className="text-xs text-muted-foreground/60 hover:text-[#CC4444]"
            onClick={() => {
              if (!window.confirm(`确认删除分组「${title}」？标签不会被删除（变为未分组）。`)) return;
              deleteGroup.mutate(groupId, {
                onSuccess: () => toast.success('分组已删除'),
                onError: () => toast.error('删除失败'),
              });
            }}
          >
            删除分组
          </button>
        )}
      </div>
      {tags.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground/60">暂无标签</p>
      ) : (
        <div className="flex flex-col">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onEditTag(tag)}
              className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 truncate">{tag.title}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              <button
                className="text-muted-foreground hover:text-[#CC4444]"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!window.confirm(`确认删除标签「${tag.title}」？`)) return;
                  deleteTag.mutate(tag.id, {
                    onSuccess: () => toast.success('标签已删除'),
                    onError: () => toast.error('删除失败'),
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagForm({
  open,
  onOpenChange,
  tag,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagResponseDto | null;
  groups: { id: string; title: string }[];
}) {
  const isEdit = !!tag;
  const [title, setTitle] = React.useState('');
  const [color, setColor] = React.useState('#3B82F6');
  const [tagGroupId, setTagGroupId] = React.useState<string>('');

  React.useEffect(() => {
    if (open) {
      setTitle(tag?.title ?? '');
      setColor(tag?.color ?? '#3B82F6');
      setTagGroupId(tag?.tagGroupId ?? '');
    }
  }, [open, tag]);

  const createTag = useCreateTag();
  const updateTag = useUpdateTag();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('请填写标题');
      return;
    }
    if (isEdit && tag) {
      const data: UpdateTagDto = {
        title: trimmed,
        color,
        tagGroupId: tagGroupId || null,
      };
      updateTag.mutate(
        { id: tag.id, data },
        {
          onSuccess: () => {
            toast.success('已保存');
            onOpenChange(false);
          },
          onError: () => toast.error('保存失败'),
        },
      );
    } else {
      const data: CreateTagDto = {
        title: trimmed,
        color,
        tagGroupId: tagGroupId || null,
      };
      createTag.mutate(data, {
        onSuccess: () => {
          toast.success('标签已创建');
          onOpenChange(false);
        },
        onError: () => toast.error('创建失败'),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑标签' : '新标签'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-title">标题</Label>
            <Input
              id="tag-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="标签名称"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-ring ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`选择颜色 ${c}`}
                />
              ))}
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-24 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                placeholder="#3B82F6"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tag-group">分组</Label>
            <select
              id="tag-group"
              value={tagGroupId}
              onChange={(e) => setTagGroupId(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
            >
              <option value="">未分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={createTag.isPending || updateTag.isPending}>
            {isEdit ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagGroupForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = React.useState('');
  React.useEffect(() => {
    if (open) setTitle('');
  }, [open]);

  const createGroup = useCreateTagGroup();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('请填写标题');
      return;
    }
    createGroup.mutate(
      { title: trimmed },
      {
        onSuccess: () => {
          toast.success('分组已创建');
          onOpenChange(false);
        },
        onError: () => toast.error('创建失败'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新分组</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="group-title">标题</Label>
          <Input
            id="group-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="分组名称"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={createGroup.isPending}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}