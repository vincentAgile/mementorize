import { Injectable } from '@nestjs/common';
import { PronunciationService } from '../../../pronunciation/pronunciation.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ItemsService } from '../../items.service.js';
import { contentOf } from '../../item-content.js';
import { SEPARATOR_CHARS, toCsv } from './csv.js';
import { analyzeImport, type ImportAnalysis } from './vocabulary-import.js';

/** The columns of the file, in this order (MEM-50): the same for the export and the import. */
export const CSV_HEADERS = [
  'Expression française',
  'Expression anglaise',
  'Thématique',
  'Phrase exemple français',
  'Phrase exemple anglais',
];

/** Import / export of the vocabulary as CSV files (MEM-50). */
@Injectable()
export class VocabularyCsvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
    private readonly pronunciations: PronunciationService,
  ) {}

  /** The separator chosen in the settings (MEM-55). */
  async separator(userId: string): Promise<string> {
    const { csvSeparator } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { csvSeparator: true },
    });
    return SEPARATOR_CHARS[csvSeparator];
  }

  /**
   * MEM-53: what importing this file would do, line by line, against the
   * user's vocabulary as it is now. Nothing is saved.
   */
  async preview(userId: string, content: string): Promise<ImportAnalysis> {
    const [separator, items] = await Promise.all([
      this.separator(userId),
      this.prisma.item.findMany({ where: { userId, type: 'Vocabulary' }, select: { content: true, type: true } }),
    ]);
    const existing = items.map((item) => {
      const { word, translation } = contentOf({ ...item, type: 'Vocabulary' as const });
      return { english: word, french: translation };
    });
    const other = separator === SEPARATOR_CHARS.Semicolon ? SEPARATOR_CHARS.Comma : SEPARATOR_CHARS.Semicolon;
    return analyzeImport(content, separator, other, existing);
  }

  /**
   * MEM-52: every vocabulary item, whatever its state, oldest first, after a
   * line of headers. Neither the state nor the review history: the file has
   * the format of the import, for a round trip.
   */
  async export(userId: string): Promise<{ csv: string; count: number }> {
    const [separator, items] = await Promise.all([
      this.separator(userId),
      this.prisma.item.findMany({ where: { userId, type: 'Vocabulary' }, orderBy: { createdAt: 'asc' } }),
    ]);
    const lines = items.map((item) => {
      const { word, translation, example, frenchExample, topic } = contentOf({ ...item, type: 'Vocabulary' as const });
      return [translation, word, topic ?? '', frenchExample ?? '', example ?? ''];
    });
    return { csv: toCsv([CSV_HEADERS, ...lines], separator), count: items.length };
  }

  /**
   * MEM-54: imports the lines "to import" of the file, analysed again now
   * (duplicates included: the vocabulary may have changed since the
   * preview), in a single transaction. The items are "En attente" (MEM-62):
   * they join the learning queue from the list. With their topic and
   * examples, in the order of the file.
   */
  async import(
    userId: string,
    content: string,
  ): Promise<
    { ok: true; imported: number; duplicate: number; error: number } | Extract<ImportAnalysis, { ok: false }>
  > {
    const analysis = await this.preview(userId, content);
    if (!analysis.ok) return analysis;
    const rows = analysis.rows.filter((row) => row.status === 'new');
    const created = await this.items.createMany(
      userId,
      'Vocabulary',
      rows.map((row) => ({
        word: row.english,
        translation: row.french,
        example: row.example || null,
        frenchExample: row.frenchExample || null,
        topic: row.topic || null,
      })),
      new Date(),
      'Waiting',
    );
    for (const item of created) this.pronunciations.request(item.id); // MEM-39, in the background
    return { ok: true, imported: created.length, duplicate: analysis.summary.duplicate, error: analysis.summary.error };
  }
}
