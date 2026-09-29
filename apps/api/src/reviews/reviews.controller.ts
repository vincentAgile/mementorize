import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /** GET /reviews/due?limit=20 — what to review now. */
  @Get('due')
  findDue(@CurrentUser() user: AuthUser, @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number) {
    return this.reviewsService.findDue(user.id, Math.min(Math.max(limit, 1), 100));
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
