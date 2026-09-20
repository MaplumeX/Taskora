import type { CreateTagGroupDto, TagGroupResponseDto, UpdateTagGroupDto } from '@taskora/shared';

import { apiClient } from './client';

/** REST 实现（thin-client，web 端在过渡期维持现状，ADR-0007）。 */
export function getTagGroups(): Promise<TagGroupResponseDto[]> {
  return apiClient.get<TagGroupResponseDto[]>('/tag-groups').then((res) => res.data);
}

export function getTagGroup(id: string): Promise<TagGroupResponseDto> {
  return apiClient.get<TagGroupResponseDto>(`/tag-groups/${id}`).then((res) => res.data);
}

export function createTagGroup(data: CreateTagGroupDto): Promise<TagGroupResponseDto> {
  return apiClient.post<TagGroupResponseDto>('/tag-groups', data).then((res) => res.data);
}

export function updateTagGroup(id: string, data: UpdateTagGroupDto): Promise<TagGroupResponseDto> {
  return apiClient.patch<TagGroupResponseDto>(`/tag-groups/${id}`, data).then((res) => res.data);
}

export function deleteTagGroup(id: string): Promise<void> {
  return apiClient.delete(`/tag-groups/${id}`).then(() => undefined);
}
