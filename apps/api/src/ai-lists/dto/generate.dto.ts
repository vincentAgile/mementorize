import { ArrayMaxSize, IsArray, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LanguageLevel } from '@prisma/client';
import { ENTRY_KINDS, type EntryKind } from '../../conversations/model/conversation-model.js';

export const COUNTS = [5, 10, 15, 20] as const;

/** MEM-139: what to generate. The theme's length is checked once trimmed, by the service. */
export class GenerateDto {
  @IsEnum(LanguageLevel)
  level!: LanguageLevel;

  @IsString()
  theme!: string;

  @IsIn(COUNTS)
  count!: (typeof COUNTS)[number];

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
