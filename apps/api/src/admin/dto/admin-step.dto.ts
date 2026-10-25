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
