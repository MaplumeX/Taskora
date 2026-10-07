import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { AttachmentResponseDto, CreateAttachmentDto, TaskResponseDto } from '@taskora/shared';

import {
  createAttachment,
  deleteAttachment,
  reorderAttachments,
  updateAttachment,
} from '@/api/tasks.api';
import { blobChannel, isPreviewableImage } from '../attachments/attachment-files';
import type { BlobActivity } from '../attachments/blob-channel';
import { refreshAfterWrite, useQueryCache } from './cache-patches';
import { taskKeys } from './useTasks';

// ---------- Attachment 元数据 hooks（ADR-0019） ----------
//
// 附件只出现在任务详情（taskKeys.detail）里：乐观补丁只改那一份缓存。
// Engine 模式下缓存由变更通知驱动刷新，REST 模式写后刷新详情。

function applyToAttachments(
  task: TaskResponseDto | undefined,
  updater: (attachments: AttachmentResponseDto[]) => AttachmentResponseDto[],
): TaskResponseDto | undefined {
  if (!task) return task;
  return { ...task, attachments: updater(task.attachments ?? []) };
}

/** 乐观改写某任务详情里的附件列表；返回回滚用的快照。 */
function usePatchAttachments() {
  const queryClient = useQueryCache();
  return {
    queryClient,
    async patch(
      taskId: string,
      updater: (attachments: AttachmentResponseDto[]) => AttachmentResponseDto[],
    ) {
      await queryClient.cancelQueries({ queryKey: taskKeys.detail(taskId) });
      const snapshot = queryClient.getQueryData<TaskResponseDto>(taskKeys.detail(taskId));
      queryClient.setQueryData<TaskResponseDto>(taskKeys.detail(taskId), (old) =>
        applyToAttachments(old, updater),
      );
      return { taskId, snapshot };
    },
    rollback(ctx: { taskId: string; snapshot: TaskResponseDto | undefined } | undefined) {
      if (ctx?.snapshot !== undefined) {
        queryClient.setQueryData(taskKeys.detail(ctx.taskId), ctx.snapshot);
      }
    },
    refresh(taskId: string) {
      refreshAfterWrite(queryClient, { queryKey: taskKeys.detail(taskId) });
    },
  };
}

/** 写附件元数据（Blob 已由调用方放进 Blob 通道）。乐观行带客户端 id。 */
export function useCreateAttachment() {
  const cache = usePatchAttachments();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: CreateAttachmentDto }) =>
      createAttachment(taskId, data),
    onMutate: ({ taskId, data }) => {
      const now = new Date().toISOString();
      const optimistic: AttachmentResponseDto = {
        id: data.id ?? crypto.randomUUID(),
        taskId,
        name: data.name,
        mimeType: data.mimeType,
        size: data.size,
        blobHash: data.blobHash,
        createdAt: now,
        updatedAt: now,
      };
      return cache.patch(taskId, (attachments) => [
        ...attachments.filter((item) => item.id !== optimistic.id),
        optimistic,
      ]);
    },
    onError: (_err, _vars, ctx) => cache.rollback(ctx),
    onSettled: (_data, _err, { taskId }) => cache.refresh(taskId),
  });
}

export function useRenameAttachment() {
  const cache = usePatchAttachments();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; taskId: string; name: string }) =>
      updateAttachment(id, { name }),
    onMutate: ({ id, taskId, name }) =>
      cache.patch(taskId, (attachments) =>
        attachments.map((item) => (item.id === id ? { ...item, name } : item)),
      ),
    onError: (_err, _vars, ctx) => cache.rollback(ctx),
    onSettled: (_data, _err, { taskId }) => cache.refresh(taskId),
  });
}

export function useDeleteAttachment() {
  const cache = usePatchAttachments();
  return useMutation({
    mutationFn: ({ id }: { id: string; taskId: string }) => deleteAttachment(id),
    onMutate: ({ id, taskId }) =>
      cache.patch(taskId, (attachments) => attachments.filter((item) => item.id !== id)),
    onError: (_err, _vars, ctx) => cache.rollback(ctx),
    onSettled: (_data, _err, { taskId }) => cache.refresh(taskId),
  });
}

export function useReorderAttachments() {
  const cache = usePatchAttachments();
  return useMutation({
    mutationFn: ({ taskId, orderedIds }: { taskId: string; orderedIds: string[] }) =>
      reorderAttachments(taskId, orderedIds),
    onMutate: ({ taskId, orderedIds }) => {
      const rank = new Map(orderedIds.map((id, index) => [id, index]));
      return cache.patch(taskId, (attachments) =>
        [...attachments].sort(
          (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
        ),
      );
    },
    onError: (_err, _vars, ctx) => cache.rollback(ctx),
    onSettled: (_data, _err, { taskId }) => cache.refresh(taskId),
  });
}

// ---------- 附件文件（Blob 通道） ----------

/**
 * 给任务添加本地文件：每个文件先进 Blob 缓存与上传队列（后台上传），再写
 * 附件元数据。逐个串行，保持选择顺序；返回新建附件的 id。
 */
export function useAddAttachmentFiles() {
  const create = useCreateAttachment();
  return useCallback(
    async (taskId: string, files: readonly File[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const file of files) {
        const { hash, size } = await blobChannel().add(file);
        const id = crypto.randomUUID();
        await create.mutateAsync({
          taskId,
          data: {
            id,
            name: file.name || 'untitled',
            mimeType: file.type || 'application/octet-stream',
            size,
            blobHash: hash,
          },
        });
        ids.push(id);
      }
      return ids;
    },
    [create],
  );
}

/** 某个 Blob 正在进行的传输（上传中 / 等待上传 / 下载中），无则 null。 */
export function useBlobActivity(hash: string): BlobActivity | null {
  const channel = blobChannel();
  return useSyncExternalStore(
    (listener) => channel.subscribe(listener),
    () => channel.activityOf(hash),
    () => null,
  );
}

/**
 * 图片附件的预览地址（object URL，按附件的 mimeType 重新包装——服务端一律
 * 回 octet-stream）。非白名单类型不预览。卸载时释放。
 */
export function useAttachmentPreviewUrl(
  attachment: Pick<AttachmentResponseDto, 'blobHash' | 'mimeType'> | null,
): { url: string | null; error: unknown } {
  const [state, setState] = useState<{ url: string | null; error: unknown }>({
    url: null,
    error: null,
  });
  const hash = attachment?.blobHash ?? null;
  const mimeType = attachment?.mimeType ?? '';
  useEffect(() => {
    if (!hash || !isPreviewableImage(mimeType)) return;
    let url: string | null = null;
    let cancelled = false;
    blobChannel()
      .read(hash)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
        setState({ url, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ url: null, error });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setState({ url: null, error: null });
    };
  }, [hash, mimeType]);
  return state;
}
