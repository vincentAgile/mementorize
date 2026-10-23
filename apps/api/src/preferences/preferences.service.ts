import { Injectable } from '@nestjs/common';
import type { CsvSeparator, ItemType, Translator } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PreferencesDto } from './dto/preferences.dto.js';

export interface Preferences {
  homeSpace: ItemType;
  translator: Translator;
  showReviewDelays: boolean;
  csvSeparator: CsvSeparator;
  vocabularyPageSize: number;
}

const SELECT = {
  homeSpace: true,
  translator: true,
  showReviewDelays: true,
  csvSeparator: true,
  vocabularyPageSize: true,
} as const;

/** The user's preferences of the web app (MEM-6, MEM-44, MEM-49, MEM-55, MEM-58), stored on their account. */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Preferences> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: SELECT });
  }

  /** Changes the preferences sent; the others stay as they are. */
  update(userId: string, dto: PreferencesDto): Promise<Preferences> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        homeSpace: dto.homeSpace,
        translator: dto.translator,
        showReviewDelays: dto.showReviewDelays,
        csvSeparator: dto.csvSeparator,
        vocabularyPageSize: dto.vocabularyPageSize,
      },
      select: SELECT,
    });
  }
}
