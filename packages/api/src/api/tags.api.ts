import type {
  CreateTagDto,
  TagResponseDto,
  UpdateTagDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function getTags(): Promise<TagResponseDto[]> {
  return apiClient.get<TagResponseDto[]>('/tags').then((res) => res.data);
}

export function getTag(id: string): Promise<TagResponseDto> {
  return apiClient.get<TagResponseDto>(`/tags/${id}`).then((res) => res.data);
}

export function createTag(data: CreateTagDto): Promise<TagResponseDto> {
  return apiClient.post<TagResponseDto>('/tags', data).then((res) => res.data);
}

export function updateTag(id: string, data: UpdateTagDto): Promise<TagResponseDto> {
  return apiClient.patch<TagResponseDto>(`/tags/${id}`, data).then((res) => res.data);
}

export function deleteTag(id: string): Promise<void> {
  return apiClient.delete(`/tags/${id}`).then(() => undefined);
}