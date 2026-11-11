import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** At most this many rows in one addition: a generation proposes 20 cards at most. */
export const MAX_ROWS = 20;

/**
 * MEM-141: a row of the preview, as the user left it (perhaps corrected):
 * the same fields and limits as a word added by hand (CreateVocabularyDto).
 * Empty once trimmed is checked by the service.
 */
export class AiListRowDto {
  @IsString()
  @MaxLength(200)
  english!: string;

  @IsString()
  @MaxLength(200)
  french!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  example?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  frenchExample?: string;
}

/** MEM-141: the rows chosen in the preview, in its order, and where they go. */
export class AddAiListDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => AiListRowDto)
  rows!: AiListRowDto[];

  /** The label of the theme, the topic of the cards (cut at 50 characters). */
  @IsString()
  @MaxLength(80)
  theme!: string;

  /** In the learning queue (default) or « En attente » (MEM-62). */
  @IsOptional()
  @IsBoolean()
  queue?: boolean;
}
