import type { AttachmentResponseDto } from '@taskora/shared';

import { useAuthStore } from '@/stores/auth.store';
import { defaultBlobCache } from './blob-cache';
import { BlobChannel } from './blob-channel';
import { httpBlobTransport } from './http-blob-transport';

/**
 * 附件文件的设备端入口（ADR-0019）：全局唯一的 Blob 通道，以及「打开附件」
 * 的平台注入点。
 */

let channel: BlobChannel | null = null;

export function blobChannel(): BlobChannel {
  if (!channel) {
    channel = new BlobChannel({
      cache: defaultBlobCache(),
      transport: httpBlobTransport,
      userId: () => useAuthStore.getState().user?.id ?? null,
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void channel?.kick());
    }
  }
  return channel;
}

let unsubscribeAuth: (() => void) | null = null;

/**
 * 宿主启动时调用一次：登录后（含启动时已登录）续传上次没传完的 Blob。
 * 之后的上传由添加文件、联网事件与失败退避驱动。
 */
export function initBlobUploads(): void {
  if (unsubscribeAuth) return;
  unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    if (state.user?.id && state.user.id !== previous.user?.id) void blobChannel().kick();
  });
  if (useAuthStore.getState().user?.id) void blobChannel().kick();
}

/** 测试 / 宿主替换通道（传 null 恢复缺省）。 */
export function setBlobChannel(next: BlobChannel | null): void {
  channel?.dispose();
  channel = next;
}

/** 内联预览的白名单：只有位图。HTML / SVG 永不内联渲染。 */
const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function isPreviewableImage(mimeType: string): boolean {
  return PREVIEWABLE.has(mimeType.toLowerCase());
}

/** 把附件交给平台：桌面 / 移动端用系统默认程序打开，Web 下载。 */
export type AttachmentOpener = (attachment: AttachmentResponseDto, blob: Blob) => Promise<void>;

/** Web 缺省：以附件文件名触发浏览器下载。 */
export const downloadInBrowser: AttachmentOpener = async (attachment, blob) => {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
};

let opener: AttachmentOpener = downloadInBrowser;

export function setAttachmentOpener(next: AttachmentOpener | null): void {
  opener = next ?? downloadInBrowser;
}

/** 读出附件内容并交给平台打开。读不到时抛 BlobUnavailableError。 */
export async function openAttachment(attachment: AttachmentResponseDto): Promise<void> {
  const blob = await blobChannel().read(attachment.blobHash);
  await opener(attachment, blob);
}
