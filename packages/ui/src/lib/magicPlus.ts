import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  ScheduledType,
  TaskBucket,
  TaskStatus,
  type CreateTaskDto,
  type TaskFeedItem,
  type TaskResponseDto,
} from '@taskora/shared';
import { useCreateTask, useSelectionStore, useUiInteractionStore } from '@taskora/api';

/**
 * Magic Plus（见 CONTEXT.md）：手机端添加按钮按住拖动，把一条新建的空任务
 * 放到列表落点。列表 surface 把它当作「一条不在列表里的任务被拖进来」，
 * 落点规则与现有行拖拽完全一致（插入位置、跨组改归属、进 Heading）。
 *
 * - MAGIC_PLUS_ID：按钮本身的拖拽源 id（不进任何列表）。
 * - MAGIC_PLUS_DRAFT_ID：拖动中列表里撑开空位的草稿任务 id；松手后新建
 *   真实任务，再把草稿替换成它写回顺序。
 * - MAGIC_PLUS_HEADING_ID：项目页里拖到屏幕左边缘时，草稿任务换成草稿
 *   Heading（把所在组从落点切开）；松手新建 Heading。
 */
export const MAGIC_PLUS_ID = 'magic-plus';
export const MAGIC_PLUS_DRAFT_ID = 'magic-plus-draft';
/** 项目页拖到屏幕左边缘时预览的草稿 Heading id。 */
export const MAGIC_PLUS_HEADING_ID = 'magic-plus-heading';

/** 项目页「左边缘」区宽度（像素）：手指进入即从新建任务切换为新建 Heading。 */
export const MAGIC_PLUS_HEADING_EDGE = 24;

/** 左下角 Inbox 目标的落点 id（拖动 Magic Plus 时浮现，见 MagicPlusInbox）。 */
export const MAGIC_PLUS_INBOX_ID = 'magic-plus-inbox';

/** Magic Plus 拖拽源的 data：只有它由 MagicPlusSensor 接管（见 appDnd）。 */
export const magicPlusDragData = { magicPlus: true };

/** 松手点离按钮原位不足该距离（像素）视为拖回原位：取消，不新建。 */
export const MAGIC_PLUS_CANCEL_RADIUS = 48;

export function isMagicPlus(id: string) {
  return id === MAGIC_PLUS_ID;
}

type DraftContext = Omit<Partial<CreateTaskDto>, 'title'>;

/** 草稿的公共字段：标题为空，其余按页面新建上下文（只用于渲染空位）。 */
function draftFields(context: DraftContext) {
  const now = new Date(0).toISOString();
  return {
    id: MAGIC_PLUS_DRAFT_ID,
    title: '',
    notes: null,
    scheduledDate: context.scheduledDate ?? null,
    scheduledType: context.scheduledType ?? ScheduledType.NONE,
    reminderTime: null,
    repeatRule: null,
    repeatSourceId: null,
    dueDate: null,
    status: TaskStatus.ACTIVE,
    bucket: context.bucket ?? TaskBucket.INBOX,
    completedAt: null,
    trashedAt: null,
    projectId: context.projectId ?? null,
    headingId: null,
    areaId: context.areaId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function magicPlusDraftTask(context: DraftContext): TaskResponseDto {
  return { ...draftFields(context), tags: [], subtasks: [] };
}

export function magicPlusDraftFeedItem(context: DraftContext): TaskFeedItem {
  return { ...draftFields(context), type: 'task', tags: [] };
}

/**
 * 松手后新建任务：列表的新建上下文（页面上下文 / 所在项目）+ 落点决定的字段
 * （归属等）。成功后与点按新建一致——展开并进入标题编辑、Selection 移到
 * 新行；失败提示并返回 null。
 */
export function useMagicPlusCreate(context: DraftContext) {
  const { t } = useTranslation();
  const createTask = useCreateTask();
  const mutateAsync = createTask.mutateAsync;
  const create = React.useCallback(
    async (fields: DraftContext = {}): Promise<TaskResponseDto | null> => {
      try {
        const created = await mutateAsync({ title: '', ...context, ...fields });
        useUiInteractionStore.getState().setExpandedId(created.id);
        useSelectionStore.getState().setSelection([created.id]);
        return created;
      } catch {
        toast.error(t('common:createFailed'));
        return null;
      }
    },
    [context, mutateAsync, t],
  );
  return { context, create };
}
