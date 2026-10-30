import type { ItemType, Translator, UsageMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, ValidateBy, ValidateIf } from 'class-validator';
import { separatorProblem } from '../../items/csv/separator.js';
import { ITEM_TYPES } from '../../items/item-content.js';
import { type Retention, RETENTIONS } from '../../scheduling/scheduler.service.js';

/** Runtime list of the translation services (MEM-44), in sync with the Prisma enum. */
export const TRANSLATORS = { DeepL: 'DeepL', Google: 'Google' } as const satisfies Record<Translator, Translator>;

/** Runtime list of the modes of use (MEM-110), in sync with the Prisma enum. */
export const USAGE_MODES = { Standard: 'Standard', Advanced: 'Advanced' } as const satisfies Record<
  UsageMode,
  UsageMode
>;

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

/**
 * A preference not sent is left as it is; one sent is checked, null
 * included (refused, rather than reaching the database).
 */
const IfSent = () => ValidateIf((_object, value) => value !== undefined);

/** The preferences to change: only those sent (each settings form saves its own). */
export class PreferencesDto {
  /** The subject space opened on arrival (MEM-6). */
  @IfSent()
  @IsEnum(ITEM_TYPES)
  homeSpace?: ItemType;

  /** The translation service of the translate buttons (MEM-44). */
  @IfSent()
  @IsEnum(TRANSLATORS)
  translator?: Translator;

  /** Show the delays on the rating buttons (MEM-49). */
  @IfSent()
  @IsBoolean()
  showReviewDelays?: boolean;

  /** The separator of the CSV files, export and import (MEM-55): any single character since MEM-80. */
  @IfSent()
  @IsCsvSeparator()
  csvSeparator?: string;

  /** Items per page of the vocabulary list (MEM-58). */
  @IfSent()
  @IsIn(PAGE_SIZES)
  vocabularyPageSize?: number;

  /** The target retention of each space, in percent (MEM-75): 85, 90 or 95. */
  @IfSent()
  @IsIn(RETENTIONS)
  vocabularyRetention?: Retention;

  @IfSent()
  @IsIn(RETENTIONS)
  quoteRetention?: Retention;

  @IfSent()
  @IsIn(RETENTIONS)
  mindMapRetention?: Retention;

  /** The mode of use (MEM-110): Advanced adds the actions that change the learning. */
  @IfSent()
  @IsEnum(USAGE_MODES)
  usageMode?: UsageMode;
}
