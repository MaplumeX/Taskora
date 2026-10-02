import type { TagsFieldCurrent, TagsFieldPatch } from './fieldProps';

import { TagPicker } from './TagPicker';
import { tagSelectionState, toggleTagAcross } from './tagPickerOptions';

interface FieldProps {
  current: TagsFieldCurrent;
  onPatch: (data: TagsFieldPatch) => void;
  /** 见 TagPicker.allowCreate。 */
  allowCreate?: boolean;
}

/** 单个 Task / Project / Area 的 Tag 选择：TagPicker 的单对象适配（整组写 tagIds）。 */
export function TagsField({ current, onPatch, allowCreate }: FieldProps) {
  const ownIds = (current.tags ?? []).map((tag) => tag.id);
  return (
    <TagPicker
      allowCreate={allowCreate}
      stateOf={(tagId) => (ownIds.includes(tagId) ? 'all' : 'none')}
      onToggle={(tagId) =>
        onPatch({
          tagIds: ownIds.includes(tagId) ? ownIds.filter((id) => id !== tagId) : [...ownIds, tagId],
        })
      }
    />
  );
}

interface MultiFieldProps {
  /** 被编辑的多个对象及各自的自身 Tag。 */
  items: readonly { id: string; tagIds: readonly string[] }[];
  /** 只含实际变化的项；每项是该对象新的完整 tagIds。 */
  onChanges: (changes: Array<{ id: string; tagIds: string[] }>) => void;
}

/** 多个对象批量打标（三态）：各项在自己的原值上增减，不覆盖其它 Tag。 */
export function MultiTagsField({ items, onChanges }: MultiFieldProps) {
  return (
    <TagPicker
      stateOf={(tagId) => tagSelectionState(items, tagId)}
      onToggle={(tagId) => onChanges(toggleTagAcross(items, tagId))}
    />
  );
}
