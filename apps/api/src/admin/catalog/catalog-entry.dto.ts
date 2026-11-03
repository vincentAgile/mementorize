import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * MEM-117: a word of a predefined list, as the console sends it: the same
 * fields and limits as a vocabulary item (CreateVocabularyDto). The texts are
 * trimmed by the service; an empty optional one removes it.
 */
export class CreateCatalogEntryDto {
  @IsString()
  @Matches(/\S/, { message: 'french must not be empty' })
  @MaxLength(200)
  french!: string;

  /** Unique in the list, whatever its case and the spaces at both ends (409 otherwise). */
  @IsString()
  @Matches(/\S/, { message: 'english must not be empty' })
  @MaxLength(200)
  english!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  topic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  frenchExample?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  englishExample?: string | null;
}

/** Any of them; the same rules. */
export class UpdateCatalogEntryDto extends PartialType(CreateCatalogEntryDto) {}
