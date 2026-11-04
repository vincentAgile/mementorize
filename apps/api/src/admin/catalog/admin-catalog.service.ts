import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { LanguageLevel, PredefinedList } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCatalogListDto, UpdateCatalogListDto } from './catalog-list.dto.js';

/** A predefined list as the console shows it: with its number of words. */
export interface CatalogList {
  id: string;
  title: string;
  description: string | null;
  level: LanguageLevel;
  published: boolean;
  entries: number;
  createdAt: Date;
  updatedAt: Date;
}

export const DUPLICATE_TITLE = 'Une liste de ce niveau porte déjà ce titre';
export const EMPTY_LIST = 'Une liste vide ne peut pas être publiée';

const withCount = { _count: { select: { entries: true } } } as const;
const toView = ({ _count, ...list }: PredefinedList & { _count: { entries: number } }): CatalogList => ({
  ...list,
  entries: _count.entries,
});

/** An optional text: trimmed, empty → null. */
const optional = (value: string | null | undefined) => (value == null ? value : value.trim() || null);

/**
 * MEM-116: the predefined lists of vocabulary of the console (« Catalogue »),
 * each with its level; a title is unique within a level. What a user
 * adds from a list are copies (their own items): deleting a list, or its
 * words, never touches them.
 */
@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every list, with its number of words, by level (A1 to C2) then by title. */
  async lists(): Promise<CatalogList[]> {
    const lists = await this.prisma.predefinedList.findMany({
      include: withCount,
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    });
    return lists.map(toView);
  }

  async list(id: string): Promise<CatalogList> {
    const list = await this.prisma.predefinedList.findUnique({ where: { id }, include: withCount });
    if (!list) throw new NotFoundException(`List ${id} not found`);
    return toView(list);
  }

  async create(dto: CreateCatalogListDto): Promise<CatalogList> {
    const title = dto.title.trim();
    await this.uniqueTitle(title, dto.level);
    // A new list has no word yet: it can't be published at once.
    if (dto.published) throw new ConflictException(EMPTY_LIST);
    const list = await this.prisma.predefinedList.create({
      data: { title, description: optional(dto.description) ?? null, level: dto.level, published: false },
      include: withCount,
    });
    return toView(list);
  }

  async update(id: string, dto: UpdateCatalogListDto): Promise<CatalogList> {
    const current = await this.list(id);
    const title = dto.title?.trim();
    // A title is unique within its level: checked again when either changes.
    if (title !== undefined || dto.level !== undefined) {
      await this.uniqueTitle(title ?? current.title, dto.level ?? current.level, id);
    }
    if (dto.published && !current.published && current.entries === 0) throw new ConflictException(EMPTY_LIST);
    const list = await this.prisma.predefinedList.update({
      where: { id },
      data: { title, description: optional(dto.description), level: dto.level, published: dto.published },
      include: withCount,
    });
    return toView(list);
  }

  /** The list and its words; the items of the users stay as they are. */
  async remove(id: string): Promise<{ id: string; entries: number }> {
    const { entries } = await this.list(id);
    await this.prisma.predefinedList.delete({ where: { id } });
    return { id, entries };
  }

  /**
   * 409 when another list of the same level has this title, whatever its case:
   * « Monde du travail » may exist in B1 and in B2, not twice in B1.
   */
  private async uniqueTitle(title: string, level: LanguageLevel, except?: string): Promise<void> {
    const other = await this.prisma.predefinedList.findFirst({
      where: { title: { equals: title, mode: 'insensitive' }, level, ...(except && { id: { not: except } }) },
      select: { id: true },
    });
    if (other) throw new ConflictException(DUPLICATE_TITLE);
  }
}
