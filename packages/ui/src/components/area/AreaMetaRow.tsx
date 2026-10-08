import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { AreaResponseDto, UpdateAreaDto } from '@taskora/shared';
import { useUpdateArea } from '@taskora/api';

import { MetaPopover, MetaTagDots } from '@/components/common/MetaBadge';
import { ReviewMetaBadge } from '@/components/review/ReviewSchedule';
import { TagsField } from '@/components/task/fields/TagsField';

/**
 * Area 详情头部的元数据行：标签 / 下次回顾日。
 * 徽章风格与 ProjectMetaRow 一致，点击打开对应选择器编辑。
 */
export function AreaMetaRow({ area }: { area: AreaResponseDto }) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const updateArea = useUpdateArea();

  const patch = (data: UpdateAreaDto) =>
    updateArea.mutate({ id: area.id, data }, { onError: () => toast.error(tc('saveFailed')) });

  const tags = area.tags ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.length > 0 ? (
        <MetaPopover label={t('tags')} trigger={<MetaTagDots tags={tags} />}>
          <TagsField current={area} onPatch={patch} />
        </MetaPopover>
      ) : null}

      <ReviewMetaBadge target={{ kind: 'area', ...area }} />
    </div>
  );
}
