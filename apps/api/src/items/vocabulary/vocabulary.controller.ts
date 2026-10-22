import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ItemsService } from '../items.service.js';
import { CreateVocabularyDto } from './dto/create-vocabulary.dto.js';
import { UpdateVocabularyDto } from './dto/update-vocabulary.dto.js';
import { toVocabularyView } from './vocabulary-view.js';

@Controller('vocabulary')
@UseGuards(JwtAuthGuard)
export class VocabularyController {
  constructor(private readonly items: ItemsService) {}

  /** Creates the word and its two cards (English → French, French → English). */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateVocabularyDto) {
    const item = await this.items.create(user.id, 'Vocabulary', {
      word: dto.word,
      translation: dto.translation,
      example: dto.example ?? null,
    });
    return toVocabularyView(item);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    return (await this.items.findAll(user.id, 'Vocabulary')).map(toVocabularyView);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return toVocabularyView(await this.items.findOne(user.id, id, 'Vocabulary'));
  }

  /**
   * Changes the English, the French or the example (MEM-19). The cards, the
   * learning state and the review history stay as they are; an empty
   * example removes it.
   */
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateVocabularyDto) {
    const changes = { ...dto, ...(dto.example !== undefined && { example: dto.example.trim() || null }) };
    return toVocabularyView(await this.items.update(user.id, id, 'Vocabulary', changes));
  }

  /** Deletes the item with its two cards and their history (MEM-20). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.items.remove(user.id, id, 'Vocabulary');
  }
}
