import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export const NAME_MAX_LENGTH = 80;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Both fields are trimmed; an empty string clears the value. */
export class ProfileDto {
  @Transform(trim)
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MaxLength(NAME_MAX_LENGTH)
  lastName: string;
}
