import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { MindMapContent } from '../item-content.js';
import { ItemsService } from '../items.service.js';
import { SaveMindMapDto } from './dto/save-mind-map.dto.js';
import { validateMindMap } from './mind-map-tree.js';
import { toMindMapContent, toMindMapView } from './mind-map-view.js';

@Controller('mind-maps')
@UseGuards(JwtAuthGuard)
export class MindMapsController {
  constructor(private readonly items: ItemsService) {}

  /** Creates the map and one card per branch (child of the root). */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: SaveMindMapDto) {
    return toMindMapView(await this.items.create(user.id, 'MindMap', checkedContent(dto)));
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    return (await this.items.findAll(user.id, 'MindMap')).map(toMindMapView);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return toMindMapView(await this.items.findOne(user.id, id, 'MindMap'));
  }

  /**
   * Replaces the whole tree (PUT, not PATCH: the editor always sends every
   * node). Cards follow: new branches get a card, removed ones lose theirs.
   */
  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SaveMindMapDto) {
    return toMindMapView(await this.items.update(user.id, id, 'MindMap', checkedContent(dto)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.items.remove(user.id, id, 'MindMap');
  }
}

function checkedContent(dto: SaveMindMapDto): MindMapContent {
  const error = validateMindMap(dto.nodes);
  if (error) {
    throw new BadRequestException(error);
  }
  return toMindMapContent(dto.nodes);
}
