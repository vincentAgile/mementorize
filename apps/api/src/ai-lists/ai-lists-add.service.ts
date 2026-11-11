import { BadRequestException, Injectable } from '@nestjs/common';
import { contentOf } from '../items/item-content.js';
import { ItemsService } from '../items/items.service.js';
import { duplicateKey } from '../items/vocabulary/csv/vocabulary-import.js';
import { PronunciationService } from '../pronunciation/pronunciation.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AiListRowDto } from './dto/add.dto.js';

/** The topic of the cards: the label of the theme, 50 characters at most (as a word added by hand). */
export const TOPIC_MAX = 50;

/**
 * MEM-141: the cards proposed by the AI, as the user left them in the
 * preview, added to « Ma liste » as by hand: by the items service (two
 * cards, FSRS), with their examples, the label of the theme as topic, in the
 * order of the preview, at the end of the learning queue or « En attente »;
 * all or none. The fields are checked again; a word that came into « Ma
 * liste » meanwhile (or twice in the rows) is skipped without an error, as
 * the predefined lists do (MEM-118). Not counted as a generation.
 */
@Injectable()
export class AiListsAddService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly pronunciations: PronunciationService,
  ) {}

  async add(
    userId: string,
    rows: AiListRowDto[],
    theme: string,
    queue = true,
  ): Promise<{ added: number; skipped: number }> {
    const cleaned = rows.map((row) => ({
      english: row.english.trim(),
      french: row.french.trim(),
      example: row.example?.trim() || null,
      frenchExample: row.frenchExample?.trim() || null,
    }));
    if (cleaned.some((row) => !row.english || !row.french)) {
      throw new BadRequestException('Each row needs its English and its French');
    }
    const topic = theme.trim().slice(0, TOPIC_MAX).trim() || null;
    const owned = await this.ownedKeys(userId);
    const fresh = cleaned.filter((row) => {
      const key = duplicateKey(row.english);
      if (owned.has(key)) return false;
      owned.add(key);
      return true;
    });
    const created = await this.items.createMany(
      userId,
      'Vocabulary',
      fresh.map((row) => ({
        word: row.english,
        translation: row.french,
        example: row.example,
        frenchExample: row.frenchExample,
        topic,
      })),
      new Date(),
      queue ? 'ToLearn' : 'Waiting',
    );
    for (const item of created) this.pronunciations.request(item.id); // MEM-39, in the background
    return { added: created.length, skipped: rows.length - created.length };
  }

  /** The English of the user's vocabulary, as duplicate keys (MEM-50). */
  private async ownedKeys(userId: string): Promise<Set<string>> {
    const items = await this.prisma.item.findMany({
      where: { userId, type: 'Vocabulary' },
      select: { content: true },
    });
    return new Set(items.map((item) => duplicateKey(contentOf({ ...item, type: 'Vocabulary' as const }).word)));
  }
}
