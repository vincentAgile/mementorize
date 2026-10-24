import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../../auth/auth-user.js';
import { CurrentUser } from '../../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { ImportFileDto } from '../../csv/import-file.dto.js';
import { QuotesCsvService } from './quotes-csv.service.js';

/** Import / export of the quotes as CSV files (MEM-72). */
@Controller('quotes-csv')
@UseGuards(JwtAuthGuard)
export class QuotesCsvController {
  constructor(private readonly csv: QuotesCsvService) {}

  /** GET /quotes-csv/export — all the quotes, as a file to download. */
  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { csv } = await this.csv.export(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mementorize-citations-${date}.csv"`);
    return csv;
  }

  /**
   * POST /quotes-csv/preview { content } — the lines of a file to import,
   * each with its status: to import, duplicate or error. Nothing is saved.
   * A file that can't be read gives { ok: false, problem }.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@CurrentUser() user: AuthUser, @Body() dto: ImportFileDto) {
    return this.csv.preview(user.id, dto.content);
  }

  /** POST /quotes-csv/import { content } — imports the lines "to import", all or none, "En attente". */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportFileDto) {
    return this.csv.import(user.id, dto.content);
  }
}
