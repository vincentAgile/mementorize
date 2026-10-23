import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../../../auth/auth-user.js';
import { CurrentUser } from '../../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
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
}
