export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

import type { UserResponseDto } from './user.dto';

export interface AuthResponseDto {
  accessToken: string;
  /**
   * Rotated refresh token. Only present for non-cookie clients (desktop):
   * the web client receives it via an HttpOnly cookie instead.
   */
  refreshToken?: string;
  user: Pick<
    UserResponseDto,
    'id' | 'email' | 'displayName' | 'avatarUrl' | 'preferences'
  >;
}

/** Body for `POST /auth/refresh`; web sends it empty (refresh token comes
 * from the HttpOnly cookie), desktop sends its keychain-stored token. */
export interface RefreshRequestDto {
  refreshToken?: string;
}
