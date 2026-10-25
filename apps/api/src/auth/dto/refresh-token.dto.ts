import { IsString, MaxLength } from 'class-validator';

/** The renewal token of a session (MEM-85), for /auth/refresh and /auth/logout. */
export class RefreshTokenDto {
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}
