import { Injectable, NotFoundException } from '@nestjs/common';
import type { Card, Item, ItemType, LearningStatus, Prisma } from '@prisma/client';
import { hasQueue, IN_QUEUE, renumberQueue } from '../learning/learning-queue.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { type CardSlot, cardSlots, type ContentByType, initialLearningStatus, slotKey } from './item-content.js';

export type CardSummary = Pick<Card, 'id' | 'kind' | 'nodeId' | 'due' | 'state' | 'learnedAt'>;
export type ItemWithCards = Item & { cards: CardSummary[] };

const WITH_CARDS = {
  cards: {
    select: { id: true, kind: true, nodeId: true, due: true, state: true, learnedAt: true },
    orderBy: [{ kind: 'asc' }, { due: 'asc' }],
  },
} satisfies Prisma.ItemInclude;

const DAY = 24 * 60 * 60 * 1000;

/**
 * Type-agnostic storage of items. The per-type controllers (quotes,
 * vocabulary) validate their own payloads and use this service; nothing
 * here depends on what's inside `content`.
 */
@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  /**
   * Creates the item together with its review cards. An item "À apprendre"
   * goes last in the learning queue of its type (MEM-61, MEM-67).
   */
  async create<T extends ItemType>(
    userId: string,
    type: T,
    content: ContentByType[T],
    now = new Date(),
    learningStatus: LearningStatus = initialLearningStatus(type),
  ): Promise<ItemWithCards> {
    const cards = cardSlots(type, content).map((slot) => this.newCard(slot, now));
    const learnPosition = learningStatus === 'ToLearn' ? (await this.queueLength(userId, type)) + 1 : null;

    return this.prisma.item.create({
      data: {
        userId,
        type,
        content: content as Prisma.InputJsonValue,
        learningStatus,
        learnPosition,
        cards: { create: cards },
      },
      include: WITH_CARDS,
    });
  }

  /** The last position of the learning queue of this type (MEM-61): its length, positions having no gap. */
  private async queueLength(userId: string, type: ItemType): Promise<number> {
    if (!hasQueue(type)) return 0;
    const { _max } = await this.prisma.item.aggregate({
      where: IN_QUEUE(userId, type),
      _max: { learnPosition: true },
    });
    return _max.learnPosition ?? 0;
  }

  /**
   * Creates several items of one type in a single transaction: all or none
   * (the import of a CSV file, MEM-54). They keep the given order: each one
   * is created a millisecond after the previous one, so that "the oldest
   * first" (the learning sessions, MEM-21) follows the file.
   */
  async createMany<T extends ItemType>(
    userId: string,
    type: T,
    contents: ContentByType[T][],
    now = new Date(),
    learningStatus: LearningStatus = initialLearningStatus(type),
  ): Promise<ItemWithCards[]> {
    const last = learningStatus === 'ToLearn' ? await this.queueLength(userId, type) : 0;
    return this.prisma.$transaction(
      contents.map((content, index) => {
        const createdAt = new Date(now.getTime() + index);
        return this.prisma.item.create({
          data: {
            userId,
            type,
            content: content as Prisma.InputJsonValue,
            learningStatus,
            learnPosition: learningStatus === 'ToLearn' ? last + index + 1 : null,
            createdAt,
            cards: { create: cardSlots(type, content).map((slot) => this.newCard(slot, now)) },
          },
          include: WITH_CARDS,
        });
      }),
    );
  }

  findAll(userId: string, type?: ItemType): Promise<ItemWithCards[]> {
    return this.prisma.item.findMany({
      where: { userId, ...(type && { type }) },
      include: WITH_CARDS,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 404 if the item doesn't exist, belongs to someone else, or has another type. */
  async findOne(userId: string, id: string, type?: ItemType): Promise<ItemWithCards> {
    const item = await this.prisma.item.findFirst({
      where: { id, userId, ...(type && { type }) },
      include: WITH_CARDS,
    });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }
    return item;
  }

  /**
   * Partial update: only the fields present in `changes` are replaced.
   *
   * The cards follow the content: when the new content calls for other
   * cards (a branch added to or removed from a mind map), the missing ones
   * are created (staggered by a day each, like at creation), and the ones that no longer match anything are
   * deleted along with their history. The others keep their schedule, even
   * if their text changed (a renamed branch stays the same branch).
   */
  async update<T extends ItemType>(
    userId: string,
    id: string,
    type: T,
    changes: Partial<ContentByType[T]>,
    now = new Date(),
  ): Promise<ItemWithCards> {
    const item = await this.findOne(userId, id, type);
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const content = { ...(item.content as Prisma.JsonObject), ...defined } as unknown as ContentByType[T];

    const wanted = cardSlots(type, content);
    const wantedKeys = new Set(wanted.map(slotKey));
    const existingKeys = new Set(item.cards.map(slotKey));
    const obsolete = item.cards.filter((card) => !wantedKeys.has(slotKey(card))).map((card) => card.id);
    const missing = wanted.filter((slot) => !existingKeys.has(slotKey(slot)));

    // A single query (nested writes): content and cards change together or not at all.
    return this.prisma.item.update({
      where: { id },
      data: {
        content: content as Prisma.InputJsonValue,
        cards: {
          ...(obsolete.length > 0 && { deleteMany: { id: { in: obsolete } } }),
          ...(missing.length > 0 && {
            create: missing.map((slot, index) => this.newCard({ ...slot, delayDays: index }, now)),
          }),
        },
      },
      include: WITH_CARDS,
    });
  }

  /** Deletes the item; its cards and review history go with it (cascade). */
  async remove(userId: string, id: string, type?: ItemType): Promise<void> {
    const item = await this.findOne(userId, id, type);
    await this.prisma.item.delete({ where: { id } });
    if (item.learningStatus === 'ToLearn' && hasQueue(item.type)) {
      await renumberQueue(this.prisma, userId, item.type); // MEM-61: no gap
    }
  }

  /**
   * Deletes several items of the user at once (MEM-59), with their cards and
   * history (cascade), in a single query. The ids of other users' items, of
   * another type, or unknown, are ignored. Returns how many were deleted.
   */
  async removeMany(userId: string, ids: string[], type: ItemType): Promise<number> {
    const { count } = await this.prisma.item.deleteMany({ where: { id: { in: ids }, userId, type } });
    if (count > 0 && hasQueue(type)) await renumberQueue(this.prisma, userId, type); // MEM-61: no gap
    return count;
  }

  private newCard({ kind, nodeId, delayDays }: CardSlot, now: Date) {
    return { kind, nodeId, ...this.scheduler.newCard(new Date(now.getTime() + delayDays * DAY)) };
  }
}
