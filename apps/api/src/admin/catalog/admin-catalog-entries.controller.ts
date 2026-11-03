import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ImportFileDto } from '../../items/csv/import-file.dto.js';
import { AdminJwtGuard } from '../admin-jwt.guard.js';
import { AdminCatalogEntriesService, type CatalogEntry } from './admin-catalog-entries.service.js';
import { CreateCatalogEntryDto, UpdateCatalogEntryDto } from './catalog-entry.dto.js';

/**
 * MEM-117: the words of a predefined list of the console, and their import /
 * export as CSV files. Every route needs an administration token
 * (AdminJwtGuard): 401 with a user token.
 */
@Controller('admin/catalog/lists/:listId')
@UseGuards(AdminJwtGuard)
export class AdminCatalogEntriesController {
  constructor(private readonly entries: AdminCatalogEntriesService) {}

  /** GET …/entries — the words, in the order of the list (404: unknown list). */
  @Get('entries')
  list(@Param('listId', ParseUUIDPipe) listId: string): Promise<CatalogEntry[]> {
    return this.entries.entries(listId);
  }

  /** POST …/entries — at the end of the list. 409: the same English already there, or 500 words. */
  @Post('entries')
  add(@Param('listId', ParseUUIDPipe) listId: string, @Body() dto: CreateCatalogEntryDto): Promise<CatalogEntry> {
    return this.entries.add(listId, dto);
  }

  @Patch('entries/:id')
  update(
    @Param('listId', ParseUUIDPipe) listId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogEntryDto,
  ): Promise<CatalogEntry> {
    return this.entries.update(listId, id, dto);
  }

  /** DELETE …/entries/:id — 409 for the last word of a published list. */
  @Delete('entries/:id')
  remove(@Param('listId', ParseUUIDPipe) listId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.entries.remove(listId, id);
  }

  /** POST …/preview { content } — each line of the file with its status, and the room left. Nothing is saved. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Param('listId', ParseUUIDPipe) listId: string, @Body() dto: ImportFileDto) {
    return this.entries.preview(listId, dto.content);
  }

  /** POST …/import { content } — the lines "to import", all or none. */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(@Param('listId', ParseUUIDPipe) listId: string, @Body() dto: ImportFileDto) {
    return this.entries.import(listId, dto.content);
  }

  /** GET …/export — the list as a CSV file to download, in the format of the import. */
  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  async export(@Param('listId', ParseUUIDPipe) listId: string, @Res({ passthrough: true }) res: Response) {
    const { csv, fileName } = await this.entries.export(listId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return csv;
  }
}
