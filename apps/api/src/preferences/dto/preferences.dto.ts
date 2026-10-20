import type { ItemType } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ITEM_TYPES } from '../../items/item-content.js';

export class PreferencesDto {
  /** The subject space opened on arrival. */
  @IsEnum(ITEM_TYPES)
  homeSpace: ItemType;
}
