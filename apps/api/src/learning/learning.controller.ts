import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewDto } from '../reviews/dto/review.dto.js';
import { MoveInQueueDto } from './dto/move-in-queue.dto.js';
import { QueueItemsDto } from './dto/queue-items.dto.js';
import { LearningService } from './learning.service.js';

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /** GET /learning/session — up to five vocabulary items to learn, the oldest first. */
  @Get('session')
  session(@CurrentUser() user: AuthUser) {
    return this.learning.session(user.id);
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

  /** POST /learning/:itemId/relearn — a learned item (vocabulary, quote) goes back to the review, same schedule (MEM-22). */
  @Post(':itemId/relearn')
  relearn(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.learning.relearn(user.id, itemId);
  }

  /** POST /learning/:itemId { rating } — step 2: first review, the item moves to `Learning`. */
  @Post(':itemId')
  learn(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string, @Body() dto: ReviewDto) {
    return this.learning.learn(user.id, itemId, dto.rating);
  }
}
