import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** Example sentence in French (MEM-42), independent of the English one. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  frenchExample?: string;

  /** Topic of the pair (MEM-51), free text: "Voyage", "Cuisine"… */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  topic?: string;

  /**
   * MEM-62, at creation only: true (by default), the item goes last in the
   * learning queue ("À apprendre"); false, it is "En attente".
   */
  @IsOptional()
  @IsBoolean()
  queue?: boolean;
}
