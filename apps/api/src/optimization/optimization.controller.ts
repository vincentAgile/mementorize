import { Controller, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, Post, UseGuards } from '@nestjs/common';
import type { ItemType } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ITEM_TYPES } from '../items/item-content.js';
import { OptimizationService } from './optimization.service.js';

/** The FSRS weights optimized on the user's history, per space (MEM-76). */
@Controller('optimization')
@UseGuards(JwtAuthGuard)
export class OptimizationController {
  constructor(private readonly optimization: OptimizationService) {}

  /** GET /optimization — where each space stands: reviews, weights in use, last optimization. */
  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.optimization.status(user.id);
  }

  /**
   * POST /optimization/:type — starts the optimization of a space, in the
   * background: 202 at once; GET /optimization says when it ends. 409 when
   * the space has too few reviews, or one is running.
   */
  @Post(':type')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(@CurrentUser() user: AuthUser, @Param('type', new ParseEnumPipe(ITEM_TYPES)) type: ItemType) {
    await this.optimization.start(user.id, type); // the run goes on in the background
    return (await this.optimization.status(user.id)).find((space) => space.type === type);
  }

  /** POST /optimization/:type/reset — back to the default weights. */
  @Post(':type/reset')
  @HttpCode(HttpStatus.OK)
  async reset(@CurrentUser() user: AuthUser, @Param('type', new ParseEnumPipe(ITEM_TYPES)) type: ItemType) {
    await this.optimization.reset(user.id, type);
    return (await this.optimization.status(user.id)).find((space) => space.type === type);
  }
}
