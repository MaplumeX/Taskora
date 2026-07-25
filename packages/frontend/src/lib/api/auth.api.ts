import type { AuthResponseDto, LoginDto, RegisterDto } from '@taskora/shared';

import { apiClient } from './client';

export type AuthUser = AuthResponseDto['user'];

export function register(data: RegisterDto): Promise<AuthUser> {
  return apiClient.post<AuthUser>('/auth/register', data).then((res) => res.data);
}

export function login(data: LoginDto): Promise<AuthResponseDto> {
  return apiClient.post<AuthResponseDto>('/auth/login', data).then((res) => res.data);
}

export function getMe(): Promise<AuthUser> {
  return apiClient.get<AuthUser>('/auth/me').then((res) => res.data);
}