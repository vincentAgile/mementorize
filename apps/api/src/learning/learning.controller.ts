import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewDto } from '../reviews/dto/review.dto.js';
import { MoveInQueueDto } from './dto/move-in-queue.dto.js';
import { QueueItemsDto } from './dto/queue-items.dto.js';
import type { QueueType } from './learning-queue.js';
import { LearningService, MAX_SESSION_SIZE } from './learning.service.js';

/** MEM-94: the ids of a prepared session, separated by commas; 400 if they are not ids, or too many. */
function parseIds(value: string): string[] {
  const ids = [...new Set(value.split(',').filter((id) => id !== ''))];
  if (ids.length === 0 || ids.length > MAX_SESSION_SIZE || !ids.every((id) => isUUID(id))) {
    throw new BadRequestException(`ids: 1 to ${MAX_SESSION_SIZE} item ids, separated by commas`);
  }
  return ids;
}

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /**
   * GET /learning/session — up to five vocabulary items to learn, the first
   * ones of the learning queue; ?type=Quote: up to five quotes (MEM-68).
   * ?ids=a,b,c (MEM-94): the items chosen on the preparation page, in this
   * order, ten at most; those not in the queue are left out.
   */
  @Get('session')
  session(
    @CurrentUser() user: AuthUser,
    @Query('type', new ParseEnumPipe({ Vocabulary: 'Vocabulary', Quote: 'Quote' }, { optional: true }))
    type?: QueueType,
    @Query('ids') ids?: string,
  ) {
    const chosen = ids === undefined ? undefined : parseIds(ids);
    return type === 'Quote'
      ? this.learning.quoteSession(user.id, new Date(), chosen)
      : this.learning.session(user.id, new Date(), chosen);
  }

  // The queue routes take { type }: "Vocabulary" (by default) or "Quote" (MEM-67).

  /** POST /learning/queue/add { ids, type? } — "En attente" → last in the learning queue, in this order (MEM-63). */
  @Post('queue/add')
  @HttpCode(HttpStatus.OK)
  addToQueue(@CurrentUser() user: AuthUser, @Body() dto: QueueItemsDto) {
    return this.learning.addToQueue(user.id, dto.type ?? 'Vocabulary', dto.ids);
  }

  /** POST /learning/queue/remove { ids, type? } — out of the learning queue, back "En attente" (MEM-63). */
  @Post('queue/remove')
  @HttpCode(HttpStatus.OK)
  removeFromQueue(@CurrentUser() user: AuthUser, @Body() dto: QueueItemsDto) {
    return this.learning.removeFromQueue(user.id, dto.type ?? 'Vocabulary', dto.ids);
  }

  /** POST /learning/queue/move { id, position, type? } — reorders the learning queue (MEM-64). */
  @Post('queue/move')
  @HttpCode(HttpStatus.OK)
  moveInQueue(@CurrentUser() user: AuthUser, @Body() dto: MoveInQueueDto) {
    return this.learning.moveInQueue(user.id, dto.type ?? 'Vocabulary', dto.id, dto.position);
  }

  /** POST /learning/queue/top { ids, type? } — these items of the queue at its head, in their order (MEM-64). */
  @Post('queue/top')
  @HttpCode(HttpStatus.OK)
  moveToTopOfQueue(@CurrentUser() user: AuthUser, @Body() dto: QueueItemsDto) {
    return this.learning.moveToTopOfQueue(user.id, dto.type ?? 'Vocabulary', dto.ids);
  }

  /**
   * POST /learning/:itemId/learned — "Appris" in a review: the item leaves
   * the review (MEM-22); a vocabulary item or a quote (MEM-67).
   */
  @Post(':itemId/learned')
  markLearned(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.learning.markLearned(user.id, itemId);
  }

  /**
   * POST /learning/items/:itemId/reset — MEM-111, mode Avancé only (403
   * otherwise): the item starts its learning again, "À apprendre" last in the
   * queue, its cards from scratch, its history kept.
   */
  @Post('items/:itemId/reset')
  @HttpCode(HttpStatus.OK)
  reset(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.learning.reset(user.id, itemId);
  }

  /** POST /learning/:itemId/relearn — a learned item (vocabulary, quote) goes back to the review, same schedule (MEM-22). */
  @Post(':itemId/relearn')
  relearn(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.learning.relearn(user.id, itemId);
  }

  /**
   * POST /learning/:itemId { rating } — the first review of an item to learn
   * (step 2 for the vocabulary; a quote, MEM-68): it moves to `Learning`.
   */
  @Post(':itemId')
  learn(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string, @Body() dto: ReviewDto) {
    return this.learning.learn(user.id, itemId, dto.rating);
  }
}
