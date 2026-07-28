import type { UpdateProfileDto, UpdatePasswordDto, UserResponseDto } from '@taskora/shared';

import { apiClient } from './client';

export function updateProfile(data: UpdateProfileDto): Promise<UserResponseDto> {
  return apiClient.put<UserResponseDto>('/users/me', data).then((res) => res.data);
}

export function updatePassword(data: UpdatePasswordDto): Promise<{ ok: boolean }> {
  return apiClient.put<{ ok: boolean }>('/users/me/password', data).then((res) => res.data);
}
