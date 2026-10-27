import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MAX_SECONDS } from '../voice/audio-conversion.js';
import { PronunciationAssessmentService } from './pronunciation-assessment.service.js';

/** MEM-90: 1 MB at most (10 seconds of browser audio take far less). */
export const MAX_BYTES = 1024 * 1024;

/** The body of the request, as bytes, without keeping more than `limit`. */
function readBody(request: Request, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        request.removeAllListeners('data');
        request.resume(); // drain, without keeping it
        reject(new PayloadTooLargeException('Recording larger than 1 MB'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/** MEM-90: the assessment of the pronunciation of a vocabulary item. */
@Controller('pronunciation')
@UseGuards(JwtAuthGuard)
export class PronunciationAssessmentController {
  constructor(private readonly assessment: PronunciationAssessmentService) {}

  /** GET /pronunciation/assessment — whether it is offered (MEM-91: the « Répéter » button), and its limit. */
  @Get('assessment')
  status() {
    return { enabled: this.assessment.enabled, maxSeconds: MAX_SECONDS };
  }

  /**
   * POST /pronunciation/assess?itemId=… — the body is the recording, as the
   * browser made it (Content-Type audio/webm, audio/mp4, audio/ogg…). The
   * text it should say is the item's English. 400 (unreadable, too short),
   * 404, 413 (over 1 MB or 10 s), 415, 429 (limits), 503 (off or unavailable).
   */
  @Post('assess')
  @HttpCode(HttpStatus.OK)
  async assess(
    @CurrentUser() user: AuthUser,
    @Query('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() request: Request,
  ) {
    const mimeType = String(request.headers['content-type'] ?? '');
    if (!mimeType.startsWith('audio/')) throw new UnsupportedMediaTypeException('An audio recording is expected');
    const data = await readBody(request, MAX_BYTES);
    if (data.length === 0) throw new BadRequestException('Empty recording');
    return this.assessment.assess(user.id, itemId, { data, mimeType });
  }
}
