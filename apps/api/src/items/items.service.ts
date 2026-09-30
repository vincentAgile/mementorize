import { Injectable, NotFoundException } from '@nestjs/common';
import type { Card, Item, ItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { type CardSlot, cardSlots, type ContentByType, slotKey } from './item-content.js';

export type CardSummary = Pick<Card, 'id' | 'kind' | 'nodeId' | 'due' | 'state'>;
export type ItemWithCards = Item & { cards: CardSummary[] };

const WITH_CARDS = {
  cards: {
    select: { id: true, kind: true, nodeId: true, due: true, state: true },
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

  /** Creates the item together with its review cards. */
  create<T extends ItemType>(userId: string, type: T, content: ContentByType[T], now = new Date()): Promise<ItemWithCards> {
    const cards = cardSlots(type, content).map((slot) => this.newCard(slot, now));

    return this.prisma.item.create({
      data: { userId, type, content: content as Prisma.InputJsonValue, cards: { create: cards } },
      include: WITH_CARDS,
    });
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
          ...(missing.length > 0 && { create: missing.map((slot, index) => this.newCard({ ...slot, delayDays: index }, now)) }),
        },
      },
      include: WITH_CARDS,
    });
  }

  /** Deletes the item; its cards and review history go with it (cascade). */
  async remove(userId: string, id: string, type?: ItemType): Promise<void> {
    await this.findOne(userId, id, type);
    await this.prisma.item.delete({ where: { id } });
  }

  private newCard({ kind, nodeId, delayDays }: CardSlot, now: Date) {
    return { kind, nodeId, ...this.scheduler.newCard(new Date(now.getTime() + delayDays * DAY)) };
  }
}
