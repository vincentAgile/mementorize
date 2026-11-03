import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PredefinedEntry, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toCsv } from '../../items/csv/csv.js';
import { DEFAULT_SEPARATOR } from '../../items/csv/separator.js';
import { CSV_HEADERS } from '../../items/vocabulary/csv/vocabulary-csv.service.js';
import { analyzeImport, duplicateKey, type ImportAnalysis } from '../../items/vocabulary/csv/vocabulary-import.js';
import type { CreateCatalogEntryDto, UpdateCatalogEntryDto } from './catalog-entry.dto.js';

/** At most this many words in a list. */
export const MAX_ENTRIES = 500;

export const DUPLICATE_ENTRY = 'Ce mot est déjà dans la liste';
export const LIST_FULL = `Une liste compte ${MAX_ENTRIES} mots au plus`;
export const LAST_PUBLISHED = 'Le dernier mot d’une liste publiée ne peut pas être supprimé';
export const EMPTIED_PUBLISHED = 'Une liste publiée ne peut pas être vidée';

/** A word of a list, as the console shows it. */
export type CatalogEntry = Omit<PredefinedEntry, 'listId'>;

/** The analysis of a file, with the room left in the list. */
export type CatalogImportAnalysis = ImportAnalysis & { room: number };

export type CatalogImportResult =
  | { ok: true; imported: number; duplicate: number; error: number }
  | Extract<ImportAnalysis, { ok: false }>
  /** More words to import than the room left: nothing is imported. */
  | { ok: false; problem: 'tooManyWords'; room: number; new: number };

const optional = (value: string | null | undefined) => (value == null ? value : value.trim() || null);
const select = {
  id: true,
  position: true,
  french: true,
  english: true,
  topic: true,
  frenchExample: true,
  englishExample: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * MEM-117: the words of a predefined list, in the console: entered one by
 * one, or imported from a CSV file in the format of the vocabulary of the
 * users (MEM-50), read by the same analyser; and exported in that format,
 * for a round trip. In the order of the list: that of their entry, or of the
 * file, each new word at the end. Duplicates: the same English, whatever its
 * case and the spaces at both ends. The separator is always the semicolon.
 * What a user adds from a list are copies: changing or deleting its words
 * never touches them.
 */
@Injectable()
export class AdminCatalogEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async entries(listId: string): Promise<CatalogEntry[]> {
    await this.listOf(this.prisma, listId);
    return this.prisma.predefinedEntry.findMany({ where: { listId }, orderBy: { position: 'asc' }, select });
  }

  /** At the end of the list. 409: the list is full, or has this English already. */
  add(listId: string, dto: CreateCatalogEntryDto): Promise<CatalogEntry> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, listId);
      const words = await tx.predefinedEntry.findMany({ where: { listId }, select: { id: true, english: true } });
      if (words.length >= MAX_ENTRIES) throw new ConflictException(LIST_FULL);
      this.unique(words, dto.english);
      const last = await tx.predefinedEntry.aggregate({ where: { listId }, _max: { position: true } });
      return tx.predefinedEntry.create({
        data: {
          listId,
          position: (last._max.position ?? 0) + 1,
          french: dto.french.trim(),
          english: dto.english.trim(),
          topic: optional(dto.topic) ?? null,
          frenchExample: optional(dto.frenchExample) ?? null,
          englishExample: optional(dto.englishExample) ?? null,
        },
        select,
      });
    });
  }

  /** At its place. 409: another word of the list has this English. */
  update(listId: string, id: string, dto: UpdateCatalogEntryDto): Promise<CatalogEntry> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, listId);
      await this.entryOf(tx, listId, id);
      if (dto.english !== undefined) {
        const words = await tx.predefinedEntry.findMany({
          where: { listId, id: { not: id } },
          select: { id: true, english: true },
        });
        this.unique(words, dto.english);
      }
      return tx.predefinedEntry.update({
        where: { id },
        data: {
          french: dto.french?.trim(),
          english: dto.english?.trim(),
          topic: optional(dto.topic),
          frenchExample: optional(dto.frenchExample),
          englishExample: optional(dto.englishExample),
        },
        select,
      });
    });
  }

  /** The word; the vocabularies of the users don't change. A published list keeps a word at least (MEM-116). */
  remove(listId: string, id: string): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const list = await this.lock(tx, listId);
      await this.entryOf(tx, listId, id);
      if (list.published && (await tx.predefinedEntry.count({ where: { listId } })) === 1) {
        throw new ConflictException(LAST_PUBLISHED);
      }
      await tx.predefinedEntry.delete({ where: { id } });
      return { id };
    });
  }

  /**
   * Several words at once (the selection of the console): those of this
   * list among the ids, in a single transaction; the ids of words gone
   * already are ignored. A published list keeps a word at least.
   */
  removeMany(listId: string, ids: string[]): Promise<{ deleted: number }> {
    return this.prisma.$transaction(async (tx) => {
      const list = await this.lock(tx, listId);
      const where = { listId, id: { in: ids } };
      if (list.published) {
        const [chosen, total] = await Promise.all([
          tx.predefinedEntry.count({ where }),
          tx.predefinedEntry.count({ where: { listId } }),
        ]);
        if (chosen > 0 && chosen === total) throw new ConflictException(EMPTIED_PUBLISHED);
      }
      const { count } = await tx.predefinedEntry.deleteMany({ where });
      return { deleted: count };
    });
  }

  /** What importing this file would do, line by line, against the list as it is now. Nothing is saved. */
  async preview(listId: string, content: string): Promise<CatalogImportAnalysis> {
    await this.listOf(this.prisma, listId);
    return this.analyze(this.prisma, listId, content);
  }

  /**
   * The lines "to import" of the file, analysed again now, at the end of the
   * list in the order of the file, all at once; or nothing, when they would
   * make the list go over 500 words.
   */
  import(listId: string, content: string): Promise<CatalogImportResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, listId);
      const analysis = await this.analyze(tx, listId, content);
      if (!analysis.ok) {
        const { room: _room, ...problem } = analysis;
        return problem;
      }
      const rows = analysis.rows.filter((row) => row.status === 'new');
      if (rows.length > analysis.room) {
        return { ok: false, problem: 'tooManyWords', room: analysis.room, new: rows.length };
      }
      const last = await tx.predefinedEntry.aggregate({ where: { listId }, _max: { position: true } });
      const start = (last._max.position ?? 0) + 1;
      await tx.predefinedEntry.createMany({
        data: rows.map((row, index) => ({
          listId,
          position: start + index,
          french: row.french,
          english: row.english,
          topic: row.topic || null,
          frenchExample: row.frenchExample || null,
          englishExample: row.example || null,
        })),
      });
      return { ok: true, imported: rows.length, duplicate: analysis.summary.duplicate, error: analysis.summary.error };
    });
  }

  /** The list in the format of the import, after a line of headers; its name with the title of the list. */
  async export(listId: string, now = new Date()): Promise<{ csv: string; fileName: string }> {
    const list = await this.listOf(this.prisma, listId);
    const entries = await this.prisma.predefinedEntry.findMany({ where: { listId }, orderBy: { position: 'asc' } });
    const lines = entries.map((entry) => [
      entry.french,
      entry.english,
      entry.topic ?? '',
      entry.frenchExample ?? '',
      entry.englishExample ?? '',
    ]);
    const date = now.toISOString().slice(0, 10);
    return {
      csv: toCsv([CSV_HEADERS, ...lines], DEFAULT_SEPARATOR),
      fileName: `mementorize-liste-${slug(list.title)}-${date}.csv`,
    };
  }

  private async analyze(db: Db, listId: string, content: string): Promise<CatalogImportAnalysis> {
    const words = await db.predefinedEntry.findMany({
      where: { listId },
      orderBy: { position: 'asc' },
      select: { english: true, french: true },
    });
    const analysis = analyzeImport(content, DEFAULT_SEPARATOR, words, { duplicates: ['en'] });
    return { ...analysis, room: Math.max(0, MAX_ENTRIES - words.length) };
  }

  private unique(words: { english: string }[], english: string): void {
    const key = duplicateKey(english);
    if (words.some((word) => duplicateKey(word.english) === key)) throw new ConflictException(DUPLICATE_ENTRY);
  }

  private async listOf(db: Db, listId: string) {
    const list = await db.predefinedList.findUnique({
      where: { id: listId },
      select: { title: true, published: true },
    });
    if (!list) throw new NotFoundException(`List ${listId} not found`);
    return list;
  }

  /** The list, locked until the end of the transaction: two additions at once can't go over 500 or make a duplicate. */
  private async lock(tx: Prisma.TransactionClient, listId: string) {
    await tx.$queryRaw`SELECT "id" FROM "predefined_lists" WHERE "id" = ${listId} FOR UPDATE`;
    return this.listOf(tx, listId);
  }

  private async entryOf(db: Db, listId: string, id: string) {
    const entry = await db.predefinedEntry.findFirst({ where: { id, listId }, select: { id: true } });
    if (!entry) throw new NotFoundException(`Word ${id} not found`);
  }
}

type Db = PrismaService | Prisma.TransactionClient;

/** The title in a file name: without accents, lowercase, words joined by dashes. */
export function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'liste'
  );
}
