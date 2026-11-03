import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../admin-jwt.guard.js';
import { AdminCatalogService, type CatalogList } from './admin-catalog.service.js';
import { CreateCatalogListDto, UpdateCatalogListDto } from './catalog-list.dto.js';

/**
 * MEM-116: the predefined lists of the console (« Catalogue »). Every route
 * needs an administration token (AdminJwtGuard): 401 with a user token.
 */
@Controller('admin/catalog/lists')
@UseGuards(AdminJwtGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  /** GET /admin/catalog/lists — every list, with its number of words, by level then by title. */
  @Get()
  lists(): Promise<CatalogList[]> {
    return this.catalog.lists();
  }

  /** GET /admin/catalog/lists/:id — one list (404 if unknown). */
  @Get(':id')
  list(@Param('id', ParseUUIDPipe) id: string): Promise<CatalogList> {
    return this.catalog.list(id);
  }

  /** POST /admin/catalog/lists — 400 (empty title, unknown level), 409 (title taken, published empty). */
  @Post()
  create(@Body() dto: CreateCatalogListDto): Promise<CatalogList> {
    return this.catalog.create(dto);
  }

  /** PATCH /admin/catalog/lists/:id — the same rules; unpublishing is always allowed. */
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCatalogListDto): Promise<CatalogList> {
    return this.catalog.update(id, dto);
  }

  /** DELETE /admin/catalog/lists/:id — the list and its words; the users' items stay. */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ id: string; entries: number }> {
    return this.catalog.remove(id);
  }
}
