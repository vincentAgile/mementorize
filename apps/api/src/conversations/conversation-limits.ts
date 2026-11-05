import { Injectable } from '@nestjs/common';

/** MEM-130: the limits of the conversations with the AI, to keep the cost in hand. */
export interface ConversationLimits {
  /** Messages of a user per day, in the user's time zone. */
  messagesPerDay: number;
  /** Messages of the user in one conversation. */
  messagesPerConversation: number;
  /** Characters of a message of the user. */
  maxLength: number;
}

export const DEFAULT_LIMITS: ConversationLimits = {
  messagesPerDay: 30,
  messagesPerConversation: 20,
  maxLength: 1000,
};

/** Requests per second and per user, on every route of the conversations. */
export const REQUESTS_PER_SECOND = 3;

/**
 * Where the limits are read. They will be parameters of the app, set in the
 * console (a later story); until those exist, the defaults apply. The
 * service asks for them at each message, so a change applies at once.
 */
@Injectable()
export class ConversationLimitsService {
  async current(): Promise<ConversationLimits> {
    return DEFAULT_LIMITS;
  }
}
