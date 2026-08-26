import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import type { TaskResponseDto, UpdateTaskDto } from '@taskora/shared';

import { cn } from '@/lib/utils';
import { useTagsQuery } from '@/lib/hooks/useTags';

interface FieldProps {
  current: TaskResponseDto;
  onPatch: (data: UpdateTaskDto) => void;
}

export function TagsField({ current, onPatch }: FieldProps) {
  const { t } = useTranslation();
  const { data: tags = [] } = useTagsQuery();

  return (
    <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
      {tags.length === 0 ? (
        <span className="px-2 py-1.5 text-xs text-muted-foreground/60">
          {t('task:noTagsHint')}
        </span>
      ) : (
        tags.map((tag) => {
          const selected = (current.tags ?? []).some((it) => it.id === tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => {
                const currentIds = (current.tags ?? []).map((it) => it.id);
                const next = selected
                  ? currentIds.filter((id) => id !== tag.id)
                  : [...currentIds, tag.id];
                onPatch({ tagIds: next });
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                selected ? 'opacity-100' : 'opacity-50',
              )}
              style={{ color: tag.color }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.title}
              {selected && <Check className="ml-auto h-3.5 w-3.5" />}
            </button>
          );
        })
      )}
    </div>
  );
}
