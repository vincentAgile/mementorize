import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ItemType } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ITEM_TYPES } from '../items/item-content.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** GET /reviews/due/summary — number of due cards, in all and per type of item. */
  @Get('due/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.reviewsService.countDue(user.id);
  }

  /** GET /reviews/due?limit=20&type=Vocabulary — what to review now (type is optional). */
  @Get('due')
  findDue(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type', new ParseEnumPipe(ITEM_TYPES, { optional: true })) type?: ItemType,
  ) {
    return this.reviewsService.findDue(user.id, Math.min(Math.max(limit, 1), 100), type);
  }

  /** POST /reviews/:cardId/learned — « Appris »: a mind map branch leaves the review (MEM-48). */
  @Post(':cardId/learned')
  markLearned(@CurrentUser() user: AuthUser, @Param('cardId') cardId: string) {
    return this.reviewsService.markLearned(user.id, cardId);
  }

  /** POST /reviews/:cardId/relearn — « Remettre en révision », same schedule (MEM-48). */
  @Post(':cardId/relearn')
  relearn(@CurrentUser() user: AuthUser, @Param('cardId') cardId: string) {
    return this.reviewsService.relearn(user.id, cardId);
  }

  /**
   * POST /reviews/:cardId { rating } — self-assessment of one card. Keyed by
   * card (not by item) since phase 5: a vocabulary word has two cards.
   */
  @Post(':cardId')
  review(@CurrentUser() user: AuthUser, @Param('cardId') cardId: string, @Body() dto: ReviewDto) {
    return this.reviewsService.review(user.id, cardId, dto.rating);
  }
}
