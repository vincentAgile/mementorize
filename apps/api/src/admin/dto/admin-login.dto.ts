import { IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}
