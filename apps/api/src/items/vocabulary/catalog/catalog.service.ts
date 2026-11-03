import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { LanguageLevel } from '@prisma/client';
import { PronunciationService } from '../../../pronunciation/pronunciation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { contentOf } from '../../item-content.js';
import { ItemsService } from '../../items.service.js';
import { duplicateKey } from '../csv/vocabulary-import.js';

/** A published list, as the users see it: its number of words, and how many they have already. */
export interface CatalogListSummary {
  id: string;
  title: string;
  description: string | null;
  level: LanguageLevel;
  entries: number;
  owned: number;
}

/** A word of a list, and whether the user has it already (the same English, MEM-50). */
export interface CatalogWord {
  id: string;
  french: string;
  english: string;
  topic: string | null;
  frenchExample: string | null;
  englishExample: string | null;
  owned: boolean;
}

export type CatalogListDetail = Omit<CatalogListSummary, 'entries' | 'owned'> & { entries: CatalogWord[] };

/**
 * MEM-118: the predefined lists of the Anglais space. The users see the
 * published ones only (a draft is unknown: 404), and add their words to
 * their vocabulary: copies, created by the items service as at the entry
 * of a word (two cards, the queue), which nothing done to the list later
 * changes. A word is "already there" when the vocabulary has the same
 * English, whatever its case and the spaces at both ends (MEM-50).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly pronunciations: PronunciationService,
  ) {}

  /** The published lists, by level then by title; those of one level only when it is given. */
  async lists(userId: string, level?: LanguageLevel): Promise<CatalogListSummary[]> {
    const [lists, owned] = await Promise.all([
      this.prisma.predefinedList.findMany({
        where: { published: true, ...(level && { level }) },
        orderBy: [{ level: 'asc' }, { title: 'asc' }],
        include: { entries: { select: { english: true } } },
      }),
      this.ownedKeys(userId),
    ]);
    return lists.map(({ entries, id, title, description, level }) => ({
      id,
      title,
      description,
      level,
      entries: entries.length,
      owned: entries.filter((entry) => owned.has(duplicateKey(entry.english))).length,
    }));
  }

  /** A published list and its words, in its order; 404 for a draft or an unknown list. */
  async list(userId: string, id: string): Promise<CatalogListDetail> {
    const [list, owned] = await Promise.all([this.published(id), this.ownedKeys(userId)]);
    return {
      id: list.id,
      title: list.title,
      description: list.description,
      level: list.level,
      entries: list.entries.map(({ id, french, english, topic, frenchExample, englishExample }) => ({
        id,
        french,
        english,
        topic,
        frenchExample,
        englishExample,
        owned: owned.has(duplicateKey(english)),
      })),
    };
  }

  /**
   * Adds the words chosen to the vocabulary, in the order of the list, all
   * at once or none, at the end of the learning queue or « En attente ». A
   * word the user has already (added since the page was shown) is skipped
   * without an error. 400: a word of another list.
   */
  async add(userId: string, id: string, entryIds: string[], queue = true): Promise<{ added: number; skipped: number }> {
    const [list, owned] = await Promise.all([this.published(id), this.ownedKeys(userId)]);
    const chosen = new Set(entryIds);
    const known = new Set(list.entries.map((entry) => entry.id));
    if ([...chosen].some((entryId) => !known.has(entryId))) {
      throw new BadRequestException('Some words are not in this list');
    }
    const fresh = list.entries.filter((entry) => chosen.has(entry.id) && !owned.has(duplicateKey(entry.english)));
    const created = await this.items.createMany(
      userId,
      'Vocabulary',
      fresh.map((entry) => ({
        word: entry.english,
        translation: entry.french,
        example: entry.englishExample,
        frenchExample: entry.frenchExample,
        topic: entry.topic,
      })),
      new Date(),
      queue ? 'ToLearn' : 'Waiting',
    );
    for (const item of created) this.pronunciations.request(item.id); // MEM-39, in the background
    return { added: created.length, skipped: chosen.size - created.length };
  }

  private async published(id: string) {
    const list = await this.prisma.predefinedList.findFirst({
      where: { id, published: true },
      include: { entries: { orderBy: { position: 'asc' } } },
    });
    if (!list) throw new NotFoundException(`List ${id} not found`);
    return list;
  }

  /** The English of the user's vocabulary, as duplicate keys. */
  private async ownedKeys(userId: string): Promise<Set<string>> {
    const items = await this.prisma.item.findMany({
      where: { userId, type: 'Vocabulary' },
      select: { content: true },
    });
    return new Set(items.map((item) => duplicateKey(contentOf({ ...item, type: 'Vocabulary' as const }).word)));
  }
}
