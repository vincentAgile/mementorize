import { Body, Controller, Get, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AiListsService } from './ai-lists.service.js';
import { GenerateDto } from './dto/generate.dto.js';

/**
 * MEM-139: vocabulary cards proposed by the AI (« Générer avec l'IA »). The
 * same AI as the Chat IA (MEM-130), the same switch: off without a model
 * (status disabled, 503). Open to every account: unlike the Chat IA, not
 * restricted by CONVERSATION_ALLOWED_EMAILS.
 */
@Controller('ai-lists')
@UseGuards(JwtAuthGuard)
export class AiListsController {
  constructor(private readonly aiLists: AiListsService) {}

  /** GET /ai-lists/status — { enabled, remaining }: available, and the generations left today. */
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.aiLists.status(user.id);
  }

  /**
   * POST /ai-lists/generate { level, theme, count, kind, exclude? } — a
   * stream of server-sent events: `entry` (a card proposed, one per event),
   * then `done` ({ proposed, skippedDuplicates }), or `error` (the provider
   * failed in the middle: the generation doesn't count). Before the stream:
   * 400, 409 (one already running), 429 (daily limit, with retryAt), 502 or
   * 503. Nothing is written.
   */
  @Post('generate')
  async generate(@CurrentUser() user: AuthUser, @Body() body: GenerateDto, @Res() response: Response): Promise<void> {
    const events = await this.aiLists.generate(user.id, body);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    for await (const { event, data } of events) {
      if (!response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    response.end();
  }
}
