import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ItemsService } from '../items.service.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { toQuoteView } from './quote-view.js';

@Controller('quotes')
@UseGuards(JwtAuthGuard)
export class QuotesController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuoteDto) {
    const item = await this.items.create(user.id, 'Quote', {
      text: dto.text,
      author: dto.author ?? null,
      source: dto.source ?? null,
    });
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

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateQuoteDto) {
    return toQuoteView(await this.items.update(user.id, id, 'Quote', dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.items.remove(user.id, id, 'Quote');
  }
}
