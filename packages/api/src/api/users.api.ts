import type {
  DataImportPreview,
  DataImportStats,
  UpdateProfileDto,
  UpdatePasswordDto,
  UserResponseDto,
  UpdatePreferencesDto,
  DeleteAccountDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function updateProfile(data: UpdateProfileDto): Promise<UserResponseDto> {
  return apiClient.put<UserResponseDto>('/users/me', data).then((res) => res.data);
}

export function updatePassword(
  data: UpdatePasswordDto,
): Promise<{ ok: boolean; refreshToken?: string }> {
  return apiClient
    .put<{ ok: boolean; refreshToken?: string }>('/users/me/password', data)
    .then((res) => res.data);
}

export function updatePreferences(
  data: UpdatePreferencesDto,
): Promise<UserResponseDto> {
  return apiClient
    .put<UserResponseDto>('/users/me/preferences', data)
    .then((res) => res.data);
}

export function deleteAccount(data: DeleteAccountDto): Promise<{ ok: boolean }> {
  return apiClient
    .delete<{ ok: boolean }>('/users/me', { data })
    .then((res) => res.data);
}

/** 导出数据包（`.taskora` zip）；includeBlobs 为 false 时不含附件文件。 */
export function exportData(includeBlobs: boolean): Promise<Blob> {
  return apiClient
    .get<Blob>('/users/me/export', {
      params: includeBlobs ? undefined : { blobs: 0 },
      responseType: 'blob',
    })
    .then((res) => res.data);
}

/**
 * 上传数据包并预览（原始字节）。onProgress 收到 0–1 的上传进度。
 */
export function previewImport(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<DataImportPreview> {
  return apiClient
    .post<DataImportPreview>('/users/me/import/preview', file, {
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (event) => {
        if (event.total) onProgress?.(event.loaded / event.total);
      },
    })
    .then((res) => res.data);
}

/** 把预览过的数据包作为新数据导入当前账号。 */
export function importData(data: {
  uploadId: string;
  importPreferences: boolean;
}): Promise<DataImportStats> {
  return apiClient.post<DataImportStats>('/users/me/import', data).then((res) => res.data);
}
