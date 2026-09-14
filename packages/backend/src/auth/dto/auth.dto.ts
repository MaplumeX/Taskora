import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

/** Body of `POST /auth/refresh` and `POST /auth/logout` (desktop flow). */
export class RefreshRequestDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}