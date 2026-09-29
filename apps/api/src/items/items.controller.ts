import { Controller, Get, ParseEnumPipe, Query, UseGuards } from '@nestjs/common';
import type { ItemType } from '@prisma/client';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ITEM_TYPES } from './item-content.js';
import { ItemsService } from './items.service.js';

/** Everything the user is learning, all types mixed (or filtered with ?type=). */
@Controller('items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('type', new ParseEnumPipe(ITEM_TYPES, { optional: true })) type?: ItemType,
  ) {
    return this.itemsService.findAll(user.id, type);
  }
}
