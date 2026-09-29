import { Injectable, NotFoundException } from '@nestjs/common';
import type { Card, Item, ItemType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from '../scheduling/scheduler.service.js';
import { CARD_TEMPLATES, type ContentByType } from './item-content.js';

export type CardSummary = Pick<Card, 'id' | 'kind' | 'due' | 'state'>;
export type ItemWithCards = Item & { cards: CardSummary[] };

const WITH_CARDS = {
  cards: { select: { id: true, kind: true, due: true, state: true }, orderBy: { kind: 'asc' } },
} as const;

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
    const cards = CARD_TEMPLATES[type].map(({ kind, delayDays }) => ({
      kind,
      ...this.scheduler.newCard(new Date(now.getTime() + delayDays * DAY)),
    }));

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

  /** Partial update: only the fields present in `changes` are replaced. */
  async update<T extends ItemType>(
    userId: string,
    id: string,
    type: T,
    changes: Partial<ContentByType[T]>,
  ): Promise<ItemWithCards> {
    const item = await this.findOne(userId, id, type);
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const content = { ...(item.content as Prisma.JsonObject), ...defined };

    return this.prisma.item.update({
      where: { id },
      data: { content: content as Prisma.InputJsonValue },
      include: WITH_CARDS,
    });
  }

  /** Deletes the item; its cards and review history go with it (cascade). */
  async remove(userId: string, id: string, type?: ItemType): Promise<void> {
    await this.findOne(userId, id, type);
    await this.prisma.item.delete({ where: { id } });
  }
}
