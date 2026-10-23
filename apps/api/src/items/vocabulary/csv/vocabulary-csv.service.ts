import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { contentOf } from '../../item-content.js';
import { SEPARATOR_CHARS, toCsv } from './csv.js';

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
  constructor(private readonly prisma: PrismaService) {}

  /** The separator chosen in the settings (MEM-55). */
  async separator(userId: string): Promise<string> {
    const { csvSeparator } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { csvSeparator: true },
    });
    return SEPARATOR_CHARS[csvSeparator];
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
}
