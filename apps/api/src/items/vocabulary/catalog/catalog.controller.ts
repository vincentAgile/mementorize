import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LanguageLevel } from '@prisma/client';
import type { AuthUser } from '../../../auth/auth-user.js';
import { CurrentUser } from '../../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { AddFromListDto } from './add-from-list.dto.js';
import { CatalogService } from './catalog.service.js';

/** MEM-118: the predefined lists of the Anglais space, for the logged-in user. */
@Controller('catalog/lists')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** GET /catalog/lists?level=A2 — the published lists, with their words and those the user has already. */
  @Get()
  lists(
    @CurrentUser() user: AuthUser,
    @Query('level', new ParseEnumPipe(LanguageLevel, { optional: true })) level?: LanguageLevel,
  ) {
    return this.catalog.lists(user.id, level);
  }

  /** GET /catalog/lists/:id — a published list and its words, each « owned » or not; 404 for a draft. */
  @Get(':id')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.list(user.id, id);
  }

  /** POST /catalog/lists/:id/add { entryIds, queue } — { added, skipped }; all or none. */
  @Post(':id/add')
  @HttpCode(HttpStatus.OK)
  add(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddFromListDto) {
    return this.catalog.add(user.id, id, dto.entryIds, dto.queue ?? true);
  }
}
