import { IsString, MaxLength } from 'class-validator';

/** MEM-86: the step between the password and the code. */
export class AdminChallengeDto {
  @IsString()
  @MaxLength(2000)
  challenge: string;
}

/** MEM-86: the code of the authenticator app (6 digits), or a recovery code. */
export class AdminCodeDto extends AdminChallengeDto {
  @IsString()
  @MaxLength(40)
  code: string;
}

/** MEM-88: the password, to turn the two-step login on again. */
export class AdminPasswordDto {
  @IsString()
  @MaxLength(200)
  password: string;
}

/** MEM-88: the password and a code, to turn the two-step login off. */
export class AdminDisableTwoFactorDto extends AdminPasswordDto {
  @IsString()
  @MaxLength(40)
  code: string;
}
