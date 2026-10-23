import type { ItemType, Translator } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ITEM_TYPES } from '../../items/item-content.js';

/** Runtime list of the translation services (MEM-44), in sync with the Prisma enum. */
export const TRANSLATORS = { DeepL: 'DeepL', Google: 'Google' } as const satisfies Record<Translator, Translator>;

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
}
