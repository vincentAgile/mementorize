import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../../auth/auth-user.js';
import { CurrentUser } from '../../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { ImportFileDto } from '../../csv/import-file.dto.js';
import { VocabularyCsvService } from './vocabulary-csv.service.js';

/** Import / export of the vocabulary as CSV files (MEM-50). */
@Controller('vocabulary-csv')
@UseGuards(JwtAuthGuard)
export class VocabularyCsvController {
  constructor(private readonly csv: VocabularyCsvService) {}

  /** GET /vocabulary-csv/export — the whole vocabulary, as a file to download (MEM-52). */
  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const { csv } = await this.csv.export(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mementorize-anglais-${date}.csv"`);
    return csv;
  }

  /**
   * POST /vocabulary-csv/preview { content } — the lines of a file to
   * import, each with its status: to import, duplicate or error (MEM-53).
   * Nothing is saved. A file that can't be read gives { ok: false, problem }.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@CurrentUser() user: AuthUser, @Body() dto: ImportFileDto) {
    return this.csv.preview(user.id, dto.content);
  }

  /**
   * POST /vocabulary-csv/import { content } — imports the lines "to import"
   * of the file, all or none (MEM-54). Duplicates and errors are left out.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportFileDto) {
    return this.csv.import(user.id, dto.content);
  }
}
