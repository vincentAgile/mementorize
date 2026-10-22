import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReviewDto } from '../reviews/dto/review.dto.js';
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

  /** POST /learning/:itemId/learned — "Appris" in a review: the item leaves the review (MEM-22). */
  @Post(':itemId/learned')
  markLearned(@CurrentUser() user: AuthUser, @Param('itemId') itemId: string) {
    return this.learning.markLearned(user.id, itemId);
  }

  /** POST /learning/:itemId/relearn — a learned item goes back to the review, same schedule (MEM-22). */
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
