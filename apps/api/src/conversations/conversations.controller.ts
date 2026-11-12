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
import { ConversationRateGuard, ConversationSpeechRateGuard } from './conversation-rate.guard.js';
import { ConversationSpeech } from './conversation-speech.js';
import { ConversationVoiceInput } from './conversation-voice-input.js';
import { ConversationsService } from './conversations.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { SpeechDto } from './dto/speech.dto.js';

/**
 * MEM-130: the written conversations with the AI. Off without an AI model:
 * the status says so, the other routes answer 503. Open only to the accounts
 * the administrator granted it to (MEM-144): for the others, the status says
 * off and the other routes answer 403. Another user's conversation: 404.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly access: ConversationAccess,
    private readonly speech: ConversationSpeech,
    private readonly voiceInput: ConversationVoiceInput,
  ) {}

  /**
   * POST /conversations/voice-token — MEM-133: a token of 10 minutes for the
   * speech recognition in the browser ({ token, region, expiresAt }); the
   * key never leaves the server. 503 without Azure, 429 beyond the limits of
   * the pronunciation assessment (shared).
   */
  @Post('voice-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConversationAccessGuard, ConversationRateGuard)
  voiceToken(@CurrentUser() user: AuthUser) {
    return this.voiceInput.token(user.id);
  }

  /**
   * POST /conversations/speech { text } — MEM-132: a sentence read by
   * Kokoro (audio/mpeg), 500 characters at most. Neither the text nor the
   * audio is kept. 503 without Kokoro (the web app then uses the browser's
   * voice), 502 if it fails. 3 per second too, counted apart from the
   * messages.
   */
  @Post('speech')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ConversationAccessGuard, ConversationSpeechRateGuard)
  async speak(@Body() body: SpeechDto, @Res() response: Response): Promise<void> {
    const { audio, mimeType } = await this.speech.speak(body.text);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'no-store');
    response.end(Buffer.from(audio));
  }

  /** GET /conversations/speech/opening — MEM-132: the opening question, read in advance. */
  @Get('speech/opening')
  @UseGuards(ConversationAccessGuard)
  async opening(@Res() response: Response): Promise<void> {
    const { audio, mimeType } = await this.speech.openingSpeech();
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.end(Buffer.from(audio));
  }

  /**
   * GET /conversations/status — { enabled: false } (no AI model, or an
   * account it is not open to), or the limits, the messages sent today and
   * when that count starts again. Read on every page (the menu, MEM-131):
   * like the other readings, outside the 3 requests per second, which hold
   * the writings (a page loaded twice in a second must not fail).
   */
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    if (!(await this.access.allows(user))) return { enabled: false };
    const status = await this.conversations.status(user.id);
    // MEM-133: the microphone, when Azure is configured.
    return status.enabled ? { ...status, voiceInput: this.voiceInput.enabled } : status;
  }

  /** POST /conversations — a new conversation, opened by the question of the AI. */
  @Post()
  @UseGuards(ConversationAccessGuard, ConversationRateGuard)
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
  @UseGuards(ConversationAccessGuard, ConversationRateGuard)
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
  @UseGuards(ConversationAccessGuard, ConversationRateGuard)
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    const events = await this.conversations.send(user.id, id, body.text, undefined, body.pronunciation);
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
