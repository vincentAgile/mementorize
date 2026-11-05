import { Injectable } from '@nestjs/common';
import type { ItemType, LearningMode, Translator, UsageMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PreferencesDto } from './dto/preferences.dto.js';

export interface Preferences {
  homeSpace: ItemType;
  translator: Translator;
  showReviewDelays: boolean;
  /** The separator of the CSV files (MEM-80): a single character. */
  csvSeparator: string;
  vocabularyPageSize: number;
  /** The target retention of each space, in percent (MEM-75). */
  vocabularyRetention: number;
  quoteRetention: number;
  mindMapRetention: number;
  /** The mode of use (MEM-110): Standard, or Advanced. */
  usageMode: UsageMode;
  /** The learning mode (MEM-125): Guided, or Autonomous. */
  learningMode: LearningMode;
  /** « Espace cartes mentales »: off by default, the space hidden. */
  mindMapsEnabled: boolean;
  /** MEM-131: the privacy notice of the « Chat IA », read: not shown again. */
  chatNoticeAccepted: boolean;
}

const SELECT = {
  homeSpace: true,
  translator: true,
  showReviewDelays: true,
  csvDelimiter: true, // MEM-80: sent as csvSeparator
  vocabularyPageSize: true,
  vocabularyRetention: true,
  quoteRetention: true,
  mindMapRetention: true,
  usageMode: true,
  learningMode: true,
  mindMapsEnabled: true,
  chatNoticeAccepted: true,
} as const;

const toPreferences = ({ csvDelimiter, ...rest }: { csvDelimiter: string } & Omit<Preferences, 'csvSeparator'>) => ({
  ...rest,
  csvSeparator: csvDelimiter,
});

/** The user's preferences of the web app (MEM-6, MEM-44, MEM-49, MEM-55, MEM-58, MEM-75, MEM-110, MEM-125), stored on their account. */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Preferences> {
    return toPreferences(await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: SELECT }));
  }

  /**
   * Changes the preferences sent; the others stay as they are. The space
   * Cartes mentales turned off while it is the home page: Anglais instead.
   */
  async update(userId: string, dto: PreferencesDto): Promise<Preferences> {
    let homeSpace = dto.homeSpace;
    if (dto.mindMapsEnabled === false && homeSpace === undefined) {
      const { homeSpace: current } = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { homeSpace: true },
      });
      if (current === 'MindMap') homeSpace = 'Vocabulary';
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        homeSpace,
        translator: dto.translator,
        showReviewDelays: dto.showReviewDelays,
        csvDelimiter: dto.csvSeparator,
        vocabularyPageSize: dto.vocabularyPageSize,
        vocabularyRetention: dto.vocabularyRetention,
        quoteRetention: dto.quoteRetention,
        mindMapRetention: dto.mindMapRetention,
        usageMode: dto.usageMode,
        learningMode: dto.learningMode,
        mindMapsEnabled: dto.mindMapsEnabled,
        chatNoticeAccepted: dto.chatNoticeAccepted,
      },
      select: SELECT,
    });
    return toPreferences(user);
  }
}
