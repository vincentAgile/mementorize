import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConversationAccess, ConversationAccessGuard } from './conversation-access.js';
import { ConversationRateGuard } from './conversation-rate.guard.js';
import { ConversationsService } from './conversations.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

/**
 * MEM-130: the written conversations with the AI. Off without an AI model:
 * the status says so, the other routes answer 503. Open only to the accounts
 * of CONVERSATION_ALLOWED_EMAILS: for the others, the status says off and
 * the other routes answer 403. Another user's
 * conversation: 404.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard, ConversationRateGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly access: ConversationAccess,
  ) {}

  /**
   * GET /conversations/status — { enabled: false } (no AI model, or an
   * account it is not open to), or the limits and the messages sent today.
   */
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    if (!this.access.allows(user)) return { enabled: false };
    return this.conversations.status(user.id);
  }

  /** POST /conversations — a new conversation, opened by the question of the AI. */
  @Post()
  @UseGuards(ConversationAccessGuard)
  create(@CurrentUser() user: AuthUser) {
    return this.conversations.create(user.id);
  }

  /** GET /conversations — the most recent first. */
  @Get()
  @UseGuards(ConversationAccessGuard)
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user.id);
  }

  /** GET /conversations/:id — with the messages in order. */
  @Get(':id')
  @UseGuards(ConversationAccessGuard)
  get(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.conversations.get(user.id, id);
  }

  @Delete(':id')
  @UseGuards(ConversationAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.conversations.remove(user.id, id);
  }

  /**
   * POST /conversations/:id/messages { text } — a stream of server-sent
   * events: `evaluation` (the message of the user, saved, with its
   * corrections), `delta` (the reply, piece by piece), then `done` (the
   * reply, saved) or `error` (the provider failed in the middle: the message
   * is removed). Before the stream: 400, 404, 409 (a reply is being
   * written), 429 (limits), 502 or 503 (the provider failed).
   */
  @Post(':id/messages')
  @UseGuards(ConversationAccessGuard)
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    const events = await this.conversations.send(user.id, id, body.text);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // A proxy (nginx, if one is ever put in front) must not hold the stream back.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    // The reply is saved even if the browser leaves: the generation is paid for.
    for await (const { event, data } of events) {
      if (!response.writableEnded) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
    response.end();
  }
}
