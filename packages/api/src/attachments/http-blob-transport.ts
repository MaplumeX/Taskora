import axios from 'axios';

import { apiClient } from '@/api/client';
import type { BlobTransport } from './blob-channel';

const notFound = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 404;

/** hub 的 Blob 接口（`/blobs/:sha256`），沿用 apiClient 的服务器地址与鉴权。 */
export const httpBlobTransport: BlobTransport = {
  async exists(hash) {
    try {
      await apiClient.head(`/blobs/${hash}`);
      return true;
    } catch (error) {
      if (notFound(error)) return false;
      throw error;
    }
  },
  async upload(hash, blob) {
    await apiClient.put(`/blobs/${hash}`, blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  },
  async download(hash) {
    try {
      const res = await apiClient.get<Blob>(`/blobs/${hash}`, { responseType: 'blob' });
      return res.data;
    } catch (error) {
      if (notFound(error)) return null;
      throw error;
    }
  },
};
