import type { TagResponseDto } from '@taskora/shared';

const MAX_VISIBLE = 3;

/**
 * 行尾 Tag 胶囊（Things 3）：灰描边 + 名称，前缀用户色点；最多 3 个，余下 +N。
 * 仅宽屏显示（窄屏行宽留给标题）。Task 行与 Project 行共用。
 */
export function TaskTagCapsules({ tags }: { tags: Pick<TagResponseDto, 'id' | 'title' | 'color'>[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="hidden min-w-0 items-center gap-1 md:flex">
      {tags.slice(0, MAX_VISIBLE).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-[8rem] items-center gap-1 rounded-full border border-border px-1.5 text-meta text-muted-foreground"
          title={tag.title}
        >
          {tag.color && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
          )}
          <span className="truncate">{tag.title}</span>
        </span>
      ))}
      {tags.length > MAX_VISIBLE && (
        <span className="text-meta text-muted-foreground">+{tags.length - MAX_VISIBLE}</span>
      )}
    </div>
  );
}
