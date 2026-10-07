import { invoke } from '@tauri-apps/api/core';

import type { AttachmentOpener } from '@taskora/api';

/**
 * 桌面端打开附件（ADR-0019）：字节以原始 IPC body 交给 Rust
 * `attachment_open`，写到应用缓存目录后由系统默认程序打开。文件名经
 * encodeURIComponent 放进请求头（头只能是 ASCII）。
 */
export const tauriAttachmentOpener: AttachmentOpener = async (attachment, blob) => {
  await invoke('attachment_open', new Uint8Array(await blob.arrayBuffer()), {
    headers: {
      'x-attachment-name': encodeURIComponent(attachment.name),
      'x-attachment-hash': attachment.blobHash,
    },
  });
};
