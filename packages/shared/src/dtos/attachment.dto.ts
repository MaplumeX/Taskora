/**
 * Task 附件（Attachment，ADR-0019）：只是元数据，文件内容是按 blobHash
 * （sha256，64 位小写 hex）寻址的 Blob，经独立的上传 / 下载通道传输。
 * mimeType / size / blobHash 创建后不再改写：替换内容即移除再添加。
 */

export interface CreateAttachmentDto {
  /** 客户端预生成的 UUID：乐观行即最终行，重试幂等。 */
  id?: string;
  name: string;
  mimeType: string;
  size: number;
  blobHash: string;
}

export interface UpdateAttachmentDto {
  name?: string;
}

export interface AttachmentResponseDto {
  id: string;
  taskId: string;
  name: string;
  mimeType: string;
  /** 字节数。 */
  size: number;
  blobHash: string;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReorderAttachmentsDto {
  orderedIds: string[];
}

/** Blob 内容寻址的 hash 格式：sha256 的 64 位小写 hex。 */
export const BLOB_HASH_PATTERN = /^[0-9a-f]{64}$/;
