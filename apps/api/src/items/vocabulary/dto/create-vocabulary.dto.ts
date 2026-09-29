import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVocabularyDto {
  /** English word or expression. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  word!: string;

  /** French translation. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  translation!: string;

  /** Example sentence (English), shown on the back of the card. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  example?: string;
}
