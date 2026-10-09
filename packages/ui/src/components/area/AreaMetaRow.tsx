import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type { AreaResponseDto, UpdateAreaDto } from '@taskora/shared';
import { useUpdateArea } from '@taskora/api';

import { MetaPopover, MetaRowLayout, MetaTagPills } from '@/components/common/MetaBadge';
import { ReviewMetaBadge } from '@/components/review/ReviewSchedule';
import { TagsField } from '@/components/task/fields/TagsField';

/**
 * Area 详情头部的元数据行：左槽标签胶囊，右槽下次回顾日。
 * 骨架与 ProjectMetaRow 一致（左缘与备注对齐），点击打开对应选择器编辑。
 */
export function AreaMetaRow({ area }: { area: AreaResponseDto }) {
  const { t } = useTranslation('task');
  const { t: tc } = useTranslation('common');
  const updateArea = useUpdateArea();

  const patch = (data: UpdateAreaDto) =>
    updateArea.mutate({ id: area.id, data }, { onError: () => toast.error(tc('saveFailed')) });

  const tags = area.tags ?? [];

  return (
    <MetaRowLayout
      start={
        tags.length > 0 ? (
          <MetaPopover label={t('tags')} trigger={<MetaTagPills tags={tags} />}>
            <TagsField current={area} onPatch={patch} />
          </MetaPopover>
        ) : null
      }
      end={<ReviewMetaBadge target={{ kind: 'area', ...area }} />}
    />
  );
}
