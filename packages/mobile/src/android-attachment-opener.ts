import { invoke } from '@tauri-apps/api/core';

import type { AttachmentOpener } from '@taskora/api';

/**
 * Android 打开附件（ADR-0019）：字节以原始 IPC body 交给 attachments 插件，
 * 写进应用缓存目录后经 FileProvider 发 ACTION_VIEW。文件名经
 * encodeURIComponent 放进请求头（头只能是 ASCII）。没有应用能打开该类型时
 * 插件 reject，界面提示「无法打开附件」。
 */
export const androidAttachmentOpener: AttachmentOpener = async (attachment, blob) => {
  await invoke('plugin:attachments|open', new Uint8Array(await blob.arrayBuffer()), {
    headers: {
      'x-attachment-name': encodeURIComponent(attachment.name),
      'x-attachment-hash': attachment.blobHash,
      'x-attachment-mime': encodeURIComponent(attachment.mimeType),
    },
  });
};
