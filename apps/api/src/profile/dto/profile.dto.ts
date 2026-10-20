import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export const NAME_MAX_LENGTH = 80;

export class ProfileDto {
  /** The name, trimmed; an empty string clears it. */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  name: string;
}
