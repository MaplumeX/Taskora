import type { AuthResponseDto, LoginDto, RegisterDto, UserResponseDto } from '@taskora/shared';

import { apiClient } from './client';
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
  // Desktop sends its keychain refresh token in the body (cookies are
  // unusable from the cross-origin Tauri webview); web sends an empty body
  // and relies on the HttpOnly cookie.
  const refreshToken = readRefreshToken();
  const body = refreshToken ? { refreshToken } : {};
  return apiClient.post<AuthResponseDto>('/auth/refresh', body).then((res) => res.data);
}

export function logout(): Promise<void> {
  const refreshToken = readRefreshToken();
  const body = refreshToken ? { refreshToken } : {};
  return apiClient.post('/auth/logout', body).then(() => undefined);
}