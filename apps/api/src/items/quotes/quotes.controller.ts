import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { DeleteItemsDto } from '../delete-items.dto.js';
import { ItemsService } from '../items.service.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { toQuoteView } from './quote-view.js';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly items: ItemsService) {}

  /**
   * Creates the quote and its card: last in the learning queue of the
   * quotes, or "En attente" with { queue: false } (MEM-67, MEM-71).
   */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuoteDto) {
    const item = await this.items.create(
      user.id,
      'Quote',
      {
        text: dto.text.trim(),
        author: dto.author?.trim() || null,
        source: dto.source?.trim() || null,
        hint: dto.hint.trim(),
      },
      new Date(),
      dto.queue === false ? 'Waiting' : 'ToLearn',
    );
    return toQuoteView(item);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    return (await this.items.findAll(user.id, 'Quote')).map(toQuoteView);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return toQuoteView(await this.items.findOne(user.id, id, 'Quote'));
  }

  /**
   * Changes the text, the author, the source (MEM-69) or the recall hint
   * (MEM-106); the state, the card and its history stay as they are. An empty
   * author or source removes it; the hint can't be emptied (400).
   */
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateQuoteDto) {
    const changes = {
      ...(dto.text !== undefined && { text: dto.text.trim() }),
      ...(dto.author !== undefined && { author: dto.author.trim() || null }),
      ...(dto.source !== undefined && { source: dto.source.trim() || null }),
      ...(dto.hint !== undefined && { hint: dto.hint.trim() }),
    };
    return toQuoteView(await this.items.update(user.id, id, 'Quote', changes));
  }

  /**
   * POST /quotes/delete { ids } — deletes several quotes at once, with their
   * card and history (MEM-69). Only the user's own quotes are deleted; the
   * other ids are ignored.
   */
  @Post('delete')
  @HttpCode(HttpStatus.OK)
  async removeMany(@CurrentUser() user: AuthUser, @Body() dto: DeleteItemsDto) {
    return { deleted: await this.items.removeMany(user.id, dto.ids, 'Quote') };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.items.remove(user.id, id, 'Quote');
  }
}
