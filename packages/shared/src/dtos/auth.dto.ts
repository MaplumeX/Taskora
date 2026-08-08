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
  user: Pick<
    UserResponseDto,
    'id' | 'email' | 'displayName' | 'avatarUrl' | 'preferences'
  >;
}
