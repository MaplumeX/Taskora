import type {
  AreaResponseDto,
  CreateAreaDto,
  UpdateAreaDto,
} from '@taskora/shared';

import { apiClient } from './client';

export function getAreas(): Promise<AreaResponseDto[]> {
  return apiClient.get<AreaResponseDto[]>('/areas').then((res) => res.data);
}

export function getArea(id: string): Promise<AreaResponseDto> {
  return apiClient.get<AreaResponseDto>(`/areas/${id}`).then((res) => res.data);
}

export function createArea(data: CreateAreaDto): Promise<AreaResponseDto> {
  return apiClient.post<AreaResponseDto>('/areas', data).then((res) => res.data);
}

export function updateArea(id: string, data: UpdateAreaDto): Promise<AreaResponseDto> {
  return apiClient.patch<AreaResponseDto>(`/areas/${id}`, data).then((res) => res.data);
}

export function deleteArea(id: string): Promise<void> {
  return apiClient.delete(`/areas/${id}`).then(() => undefined);
}

export function reorderAreas(orderedIds: string[]): Promise<void> {
  return apiClient.post('/areas/reorder', { orderedIds }).then(() => undefined);
}