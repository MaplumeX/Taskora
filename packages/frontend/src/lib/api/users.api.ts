import type {
  UpdateProfileDto,
  UpdatePasswordDto,
  UserResponseDto,
  UpdatePreferencesDto,
  DeleteAccountDto,
} from '@taskora/shared';

import { apiClient } from './client';

export interface ExportDataResponse {
  exportedAt: string;
  version: string;
  user: unknown;
  tasks: unknown[];
  projects: unknown[];
  areas: unknown[];
  tags: unknown[];
  tagGroups: unknown[];
  projectHeadings: unknown[];
}

export function updateProfile(data: UpdateProfileDto): Promise<UserResponseDto> {
  return apiClient.put<UserResponseDto>('/users/me', data).then((res) => res.data);
}

export function updatePassword(data: UpdatePasswordDto): Promise<{ ok: boolean }> {
  return apiClient.put<{ ok: boolean }>('/users/me/password', data).then((res) => res.data);
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

export function exportData(): Promise<ExportDataResponse> {
  return apiClient
    .get<ExportDataResponse>('/users/me/export')
    .then((res) => res.data);
}
