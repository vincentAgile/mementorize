import { Injectable } from '@nestjs/common';

/** MEM-139: 10 generations per user and per day by default, apart from the messages of the Chat IA. */
export const DEFAULT_GENERATIONS_PER_DAY = 10;

/**
 * Where the limit is read. It will be a parameter of the app, set in the
 * console (a later story); until then, the default applies. Asked at each
 * generation, so a change applies at once.
 */
@Injectable()
export class AiListLimitsService {
  async generationsPerDay(): Promise<number> {
    return DEFAULT_GENERATIONS_PER_DAY;
  }
}
