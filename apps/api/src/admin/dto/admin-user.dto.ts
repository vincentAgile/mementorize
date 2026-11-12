import { IsBoolean, ValidateIf } from 'class-validator';

/** MEM-144: what the console changes on an account. */
export class AdminUserUpdateDto {
  /** The Chat IA granted to the account. */
  @ValidateIf((_dto, value) => value !== undefined) // null is refused, not ignored
  @IsBoolean()
  chatAiEnabled?: boolean;
}
