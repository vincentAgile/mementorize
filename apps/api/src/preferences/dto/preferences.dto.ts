import type { ItemType, Translator } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, ValidateBy } from 'class-validator';
import { separatorProblem } from '../../items/csv/separator.js';
import { ITEM_TYPES } from '../../items/item-content.js';

/** Runtime list of the translation services (MEM-44), in sync with the Prisma enum. */
export const TRANSLATORS = { DeepL: 'DeepL', Google: 'Google' } as const satisfies Record<Translator, Translator>;

/** A separator of the CSV files (MEM-80): a single character, but the double quote and the line breaks. */
const IsCsvSeparator = () =>
  ValidateBy({
    name: 'isCsvSeparator',
    validator: {
      validate: (value: unknown) => separatorProblem(value) === null,
      defaultMessage: (args) => separatorProblem(args?.value) ?? 'Invalid separator',
    },
  });

/** The page sizes of the vocabulary list (MEM-58). */
export const PAGE_SIZES = [20, 50, 100] as const;

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

  /** The separator of the CSV files, export and import (MEM-55): any single character since MEM-80. */
  @IsOptional()
  @IsCsvSeparator()
  csvSeparator?: string;

  /** Items per page of the vocabulary list (MEM-58). */
  @IsOptional()
  @IsIn(PAGE_SIZES)
  vocabularyPageSize?: number;
}
