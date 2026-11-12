import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LanguageLevel } from '@prisma/client';
import { ENTRY_KINDS, type EntryKind } from '../../conversations/model/conversation-model.js';

/** At most this many cards in one generation (the settings offer 5, 10, 15 or 20). */
export const MAX_COUNT = 20;

/** MEM-139: what to generate. The theme's length is checked once trimmed, by the service. */
export class GenerateDto {
  @IsEnum(LanguageLevel)
  level!: LanguageLevel;

  @IsString()
  theme!: string;

  /** 5, 10, 15 or 20 from the settings; fewer from « Proposer d'autres » (MEM-142): the rows to replace. */
  @IsInt()
  @Min(1)
  @Max(MAX_COUNT)
  count!: number;

  @IsIn(ENTRY_KINDS)
  kind!: EntryKind;

  /** English already proposed in this preview (« Proposer d'autres »), 60 at most. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  exclude?: string[];
}
