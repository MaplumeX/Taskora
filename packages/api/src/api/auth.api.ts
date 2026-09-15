import type { AuthResponseDto, LoginDto, RegisterDto, UserResponseDto } from '@taskora/shared';

import { apiClient, refreshSession } from './client';
import { readRefreshToken } from '@/token-store';

export type AuthUser = AuthResponseDto['user'];

export function register(data: RegisterDto): Promise<AuthUser> {
  return apiClient.post<AuthUser>('/auth/register', data).then((res) => res.data);
}

export function login(data: LoginDto): Promise<AuthResponseDto> {
  return apiClient.post<AuthResponseDto>('/auth/login', data).then((res) => res.data);
}

export function getMe(): Promise<UserResponseDto> {
  return apiClient.get<UserResponseDto>('/auth/me').then((res) => res.data);
}

export function refresh(): Promise<AuthResponseDto> {
  return refreshSession();
}

export function logout(): Promise<void> {
  const refreshToken = readRefreshToken();
  const body = refreshToken ? { refreshToken } : {};
  return apiClient.post('/auth/logout', body).then(() => undefined);
}
