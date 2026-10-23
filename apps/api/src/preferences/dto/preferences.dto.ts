import type { CsvSeparator, ItemType, Translator } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ITEM_TYPES } from '../../items/item-content.js';

/** Runtime list of the translation services (MEM-44), in sync with the Prisma enum. */
export const TRANSLATORS = { DeepL: 'DeepL', Google: 'Google' } as const satisfies Record<Translator, Translator>;

/** Runtime list of the CSV separators (MEM-55), in sync with the Prisma enum. */
export const CSV_SEPARATORS = { Semicolon: 'Semicolon', Comma: 'Comma' } as const satisfies Record<
  CsvSeparator,
  CsvSeparator
>;

/** The preferences to change: only those sent (each settings form saves its own). */
export class PreferencesDto {
  /** The subject space opened on arrival (MEM-6). */
  @IsOptional()
  @IsEnum(ITEM_TYPES)
  homeSpace?: ItemType;

  /** The translation service of the translate buttons (MEM-44). */
  @IsOptional()
  @IsEnum(TRANSLATORS)
  translator?: Translator;

  /** Show the delays on the rating buttons (MEM-49). */
  @IsOptional()
  @IsBoolean()
  showReviewDelays?: boolean;

  /** The separator of the CSV files, export and import (MEM-55). */
  @IsOptional()
  @IsEnum(CSV_SEPARATORS)
  csvSeparator?: CsvSeparator;
}
