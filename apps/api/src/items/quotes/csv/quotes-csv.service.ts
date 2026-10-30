import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { toCsv } from '../../csv/csv.js';
import { userSeparator } from '../../csv/user-separator.js';
import { contentOf } from '../../item-content.js';
import { ItemsService } from '../../items.service.js';
import { analyzeQuoteImport, type QuoteImportAnalysis } from './quote-import.js';

/**
 * The columns of the file, in this order (MEM-72): the same for the export
 * and the import. MEM-107: the recall hint last, required.
 */
export const QUOTE_CSV_HEADERS = ['Texte', 'Auteur', 'Source', 'Indice de rappel'];

/** Import / export of the quotes as CSV files (MEM-72), as the vocabulary (MEM-50). */
@Injectable()
export class QuotesCsvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly items: ItemsService,
  ) {}

  /** What importing this file would do, line by line, against the user's quotes as they are now. Nothing is saved. */
  async preview(userId: string, content: string): Promise<QuoteImportAnalysis> {
    const [separator, items] = await Promise.all([
      userSeparator(this.prisma, userId),
      this.prisma.item.findMany({ where: { userId, type: 'Quote' }, select: { content: true, type: true } }),
    ]);
    const existing = items.map((item) => contentOf({ ...item, type: 'Quote' as const }));
    return analyzeQuoteImport(content, separator, existing);
  }

  /**
   * Every quote, whatever its state, oldest first, after a line of headers.
   * Neither the state nor the review history: the file has the format of the
   * import, for a round trip.
   */
  async export(userId: string): Promise<{ csv: string; count: number }> {
    const [separator, items] = await Promise.all([
      userSeparator(this.prisma, userId),
      this.prisma.item.findMany({ where: { userId, type: 'Quote' }, orderBy: { createdAt: 'asc' } }),
    ]);
    const lines = items.map((item) => {
      const { text, author, source, hint } = contentOf({ ...item, type: 'Quote' as const });
      return [text, author ?? '', source ?? '', hint];
    });
    return { csv: toCsv([QUOTE_CSV_HEADERS, ...lines], separator), count: items.length };
  }

  /**
   * Imports the lines "to import" of the file, analysed again now (the
   * quotes may have changed since the preview), in a single transaction, in
   * the order of the file. The quotes are "En attente": they join the
   * learning queue from the list.
   */
  async import(
    userId: string,
    content: string,
  ): Promise<
    { ok: true; imported: number; duplicate: number; error: number } | Extract<QuoteImportAnalysis, { ok: false }>
  > {
    const analysis = await this.preview(userId, content);
    if (!analysis.ok) return analysis;
    const rows = analysis.rows.filter((row) => row.status === 'new');
    const created = await this.items.createMany(
      userId,
      'Quote',
      rows.map((row) => ({ text: row.text, author: row.author || null, source: row.source || null, hint: row.hint })),
      new Date(),
      'Waiting',
    );
    return { ok: true, imported: created.length, duplicate: analysis.summary.duplicate, error: analysis.summary.error };
  }
}
